local http = require "resty.http"
local cjson = require "cjson"
local redis_client = require "redis_client"

local _M = {}

-- Configuration
local MODEL_URL = os.getenv("MODEL_URL") or "http://ollama:11434"
local MODEL_NAME = os.getenv("MODEL_NAME") or "devstral"
local MODEL_TEMPERATURE = tonumber(os.getenv("MODEL_TEMPERATURE") or "0.7")
local MODEL_TOP_P = tonumber(os.getenv("MODEL_TOP_P") or "0.9")
local MODEL_TOP_K = tonumber(os.getenv("MODEL_TOP_K") or "40")
local MODEL_NUM_CTX = tonumber(os.getenv("MODEL_NUM_CTX") or "4096")
local MODEL_NUM_PREDICT = tonumber(os.getenv("MODEL_NUM_PREDICT") or "512")

-- User ID (always admin1 for internal)
local USER_ID = "admin1"

-- Generate chat ID in chat(n) format where n is timestamp
local function generate_chat_id()
    local timestamp = ngx.time() * 1000 + math.floor(ngx.var.msec or 0)
    return "chat(" .. timestamp .. ")"
end

-- Helper function to format files for AI context
local function format_files_for_context(files)
    if not files or #files == 0 then
        return ""
    end
    
    local file_context = "\n\n--- ATTACHED FILES ---\n"
    
    for _, file in ipairs(files) do
        file_context = file_context .. "\nFile: " .. (file.name or "unknown")
        file_context = file_context .. "\nType: " .. (file.type or "unknown")
        file_context = file_context .. "\nSize: " .. (file.size or "unknown") .. " bytes"
        
        if file.content then
            file_context = file_context .. "\nContent:\n```\n" .. file.content .. "\n```"
        end
        
        file_context = file_context .. "\n---\n"
    end
    
    return file_context
end

-- Generate message ID using admin(n) and jai(n) format
local function generate_message_id(redis, chat_id, message_type)
    -- Convert user/ai to admin/jai
    local id_type = message_type == "user" and "admin" or "jai"
    local counter_key = "chat:counter:" .. USER_ID .. ":" .. chat_id .. ":" .. id_type
    local counter = redis:incr(counter_key)
    redis:expire(counter_key, 86400 * 365) -- Expire after 1 year
    return id_type .. "(" .. counter .. ")"
end

-- Generate artifact ID for code blocks using admin(n)_code(x) or jai(n)_code(x)
local function generate_artifact_id(parent_message_id, code_block_index)
    return parent_message_id .. "_code(" .. code_block_index .. ")"
end

-- Save message with proper structure including artifact references
local function save_message(redis, chat_id, message_id, role, content, files, artifacts)
    local message_data = {
        id = message_id,
        role = role,
        content = content,
        files = files or {},
        artifacts = artifacts or {},
        timestamp = ngx.time(),
        chat_id = chat_id
    }
    
    -- Save individual message
    local message_key = "message:" .. USER_ID .. ":" .. chat_id .. ":" .. message_id
    redis:set(message_key, cjson.encode(message_data))
    redis:expire(message_key, 86400 * 365) -- Expire after 1 year
    
    -- Add to ordered chat message list (newest first for easy retrieval)
    local chat_messages_key = "chat:messages:" .. USER_ID .. ":" .. chat_id
    redis:lpush(chat_messages_key, message_id)
    redis:expire(chat_messages_key, 86400 * 365)
    
    -- Update chat metadata
    local chat_meta_key = "chat:meta:" .. USER_ID .. ":" .. chat_id
    local chat_meta = {
        id = chat_id,
        last_updated = ngx.time(),
        message_count = redis:llen(chat_messages_key),
        last_message_preview = string.sub(content or "", 1, 100)
    }
    redis:set(chat_meta_key, cjson.encode(chat_meta))
    redis:expire(chat_meta_key, 86400 * 365)
    
    return message_data
end

-- Save artifact (code block) with proper parent relationship
local function save_artifact(redis, chat_id, artifact_id, parent_message_id, code, language, metadata)
    local artifact_data = {
        id = artifact_id,
        parent_id = parent_message_id,
        type = "code_block",
        code = code,
        language = language or "",
        metadata = metadata or {},
        timestamp = ngx.time(),
        chat_id = chat_id
    }
    
    -- Save individual artifact
    local artifact_key = "artifact:" .. USER_ID .. ":" .. chat_id .. ":" .. artifact_id
    redis:set(artifact_key, cjson.encode(artifact_data))
    redis:expire(artifact_key, 86400 * 365)
    
    -- Add to chat artifacts list
    local chat_artifacts_key = "chat:artifacts:" .. USER_ID .. ":" .. chat_id
    redis:lpush(chat_artifacts_key, artifact_id)
    redis:expire(chat_artifacts_key, 86400 * 365)
    
    return artifact_data
end

-- Extract code blocks from content and create artifacts with proper IDs
local function extract_and_save_code_blocks(redis, chat_id, message_id, content)
    local artifacts = {}
    local code_block_index = 0
    
    -- Match code blocks: ```language\ncode\n```
    for lang, code in content:gmatch("```([%w]*)\n(.-)\n```") do
        code_block_index = code_block_index + 1
        local artifact_id = generate_artifact_id(message_id, code_block_index)
        
        local artifact = save_artifact(redis, chat_id, artifact_id, message_id, code, lang, {
            extracted_from_response = true,
            block_index = code_block_index
        })
        
        table.insert(artifacts, artifact_id)
    end
    
    return artifacts
end

-- Get chat messages in chronological order (for display)
local function get_chat_messages(redis, chat_id, limit)
    local chat_messages_key = "chat:messages:" .. USER_ID .. ":" .. chat_id
    local message_ids = redis:lrange(chat_messages_key, 0, (limit or 50) - 1)
    
    local messages = {}
    if message_ids and type(message_ids) == "table" then
        -- Reverse to get chronological order (oldest first for chat display)
        for i = #message_ids, 1, -1 do
            local message_key = "message:" .. USER_ID .. ":" .. chat_id .. ":" .. message_ids[i]
            local message_json = redis:get(message_key)
            
            if message_json and message_json ~= ngx.null then
                local ok, message = pcall(cjson.decode, message_json)
                if ok then
                    table.insert(messages, message)
                end
            end
        end
    end
    
    return messages
end

-- Get chat context for AI (last N messages in correct format for model)
local function get_chat_context(redis, chat_id, context_limit)
    local messages = get_chat_messages(redis, chat_id, context_limit or 10)
    local context_messages = {}
    
    for _, msg in ipairs(messages) do
        local role = msg.role == "user" and "user" or "assistant"
        table.insert(context_messages, {
            role = role,
            content = msg.content
        })
    end
    
    return context_messages
end

-- Serve the chat HTML page
function _M.serve_chat_page()
    local file = io.open("/usr/local/openresty/nginx/static/chat.html", "r")
    if not file then
        ngx.status = 404
        ngx.say("Chat page not found")
        return
    end
    
    local content = file:read("*all")
    file:close()
    
    ngx.header["Content-Type"] = "text/html; charset=utf-8"
    ngx.say(content)
end

-- NEW: Create new chat endpoint
function _M.handle_create_chat()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say(cjson.encode({error = "Method not allowed"}))
        return
    end
    
    ngx.header["Content-Type"] = "application/json"
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    -- Generate new chat ID
    local chat_id = generate_chat_id()
    
    -- Create empty chat metadata
    local chat_meta_key = "chat:meta:" .. USER_ID .. ":" .. chat_id
    local chat_meta = {
        id = chat_id,
        last_updated = ngx.time(),
        message_count = 0,
        last_message_preview = ""
    }
    redis:set(chat_meta_key, cjson.encode(chat_meta))
    redis:expire(chat_meta_key, 86400 * 365)
    
    redis_client.close(redis)
    
    ngx.say(cjson.encode({
        success = true,
        chat_id = chat_id,
        created_at = ngx.time()
    }))
end

-- Get chat history with proper message structure and artifact IDs
function _M.handle_chat_history()
    ngx.header["Content-Type"] = "application/json"
    
    local args = ngx.req.get_uri_args()
    local chat_id = args.chat_id
    
    if not chat_id or chat_id == "" then
        ngx.status = 400
        ngx.say(cjson.encode({error = "Missing chat_id"}))
        return
    end
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    local messages = get_chat_messages(redis, chat_id, 100)
    
    redis_client.close(redis)
    ngx.say(cjson.encode({
        messages = messages,
        chat_id = chat_id
    }))
end

-- Get message details including artifacts
function _M.handle_message_details()
    ngx.header["Content-Type"] = "application/json"
    
    local args = ngx.req.get_uri_args()
    local chat_id = args.chat_id
    local message_id = args.message_id
    
    if not chat_id or not message_id then
        ngx.status = 400
        ngx.say(cjson.encode({error = "Missing chat_id or message_id"}))
        return
    end
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    -- Get message
    local message_key = "message:" .. USER_ID .. ":" .. chat_id .. ":" .. message_id
    local message_json = redis:get(message_key)
    
    local result = {}
    if message_json and message_json ~= ngx.null then
        local ok, message = pcall(cjson.decode, message_json)
        if ok then
            result.message = message
            
            -- Get artifacts for this message
            local artifacts = {}
            if message.artifacts and type(message.artifacts) == "table" then
                for _, artifact_id in ipairs(message.artifacts) do
                    local artifact_key = "artifact:" .. USER_ID .. ":" .. chat_id .. ":" .. artifact_id
                    local artifact_json = redis:get(artifact_key)
                    
                    if artifact_json and artifact_json ~= ngx.null then
                        local ok_artifact, artifact = pcall(cjson.decode, artifact_json)
                        if ok_artifact then
                            table.insert(artifacts, artifact)
                        end
                    end
                end
            end
            result.artifacts = artifacts
        end
    end
    
    redis_client.close(redis)
    
    if result.message then
        ngx.say(cjson.encode(result))
    else
        ngx.status = 404
        ngx.say(cjson.encode({error = "Message not found"}))
    end
end

-- Get all artifacts for a chat
function _M.handle_chat_artifacts()
    ngx.header["Content-Type"] = "application/json"
    
    local args = ngx.req.get_uri_args()
    local chat_id = args.chat_id
    
    if not chat_id then
        ngx.status = 400
        ngx.say(cjson.encode({error = "Missing chat_id"}))
        return
    end
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    local chat_artifacts_key = "chat:artifacts:" .. USER_ID .. ":" .. chat_id
    local artifact_ids = redis:lrange(chat_artifacts_key, 0, -1)
    
    local artifacts = {}
    if artifact_ids and type(artifact_ids) == "table" then
        for _, artifact_id in ipairs(artifact_ids) do
            local artifact_key = "artifact:" .. USER_ID .. ":" .. chat_id .. ":" .. artifact_id
            local artifact_json = redis:get(artifact_key)
            
            if artifact_json and artifact_json ~= ngx.null then
                local ok, artifact = pcall(cjson.decode, artifact_json)
                if ok then
                    table.insert(artifacts, artifact)
                end
            end
        end
    end
    
    -- Also include message artifacts (admin/jai messages themselves)
    local messages = get_chat_messages(redis, chat_id, 1000)
    for _, message in ipairs(messages) do
        -- Determine artifact type from message ID
        local artifact_type = "unknown"
        if message.id and message.id:match("^admin%(") then
            artifact_type = "admin"
        elseif message.id and message.id:match("^jai%(") then
            artifact_type = "jai"
        end
        
        if artifact_type ~= "unknown" then
            table.insert(artifacts, {
                id = message.id,
                type = artifact_type,
                content = message.content,
                files = message.files or {},
                timestamp = message.timestamp,
                chat_id = message.chat_id
            })
        end
    end
    
    redis_client.close(redis)
    ngx.say(cjson.encode({artifacts = artifacts}))
end

-- Get list of all chats for a user
function _M.handle_chat_list()
    ngx.header["Content-Type"] = "application/json"
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    -- Get all chat metadata
    local pattern = "chat:meta:" .. USER_ID .. ":*"
    local keys = redis:keys(pattern)
    
    local chats = {}
    
    if keys and type(keys) == "table" then
        for _, key in ipairs(keys) do
            local meta_json = redis:get(key)
            if meta_json and meta_json ~= ngx.null then
                local ok, meta = pcall(cjson.decode, meta_json)
                if ok then
                    table.insert(chats, {
                        id = meta.id,
                        message_count = meta.message_count or 0,
                        last_updated = meta.last_updated or ngx.time(),
                        preview = meta.last_message_preview or ""
                    })
                end
            end
        end
    end
    
    -- Sort chats by last updated (newest first)
    table.sort(chats, function(a, b)
        return (a.last_updated or 0) > (b.last_updated or 0)
    end)
    
    redis_client.close(redis)
    ngx.say(cjson.encode({chats = chats}))
end

-- Clear chat history and artifacts
function _M.handle_clear_chat()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say(cjson.encode({error = "Method not allowed"}))
        return
    end
    
    ngx.header["Content-Type"] = "application/json"
    
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    
    if not body then
        ngx.status = 400
        ngx.say(cjson.encode({error = "No request body"}))
        return
    end
    
    local ok, request_data = pcall(cjson.decode, body)
    if not ok or not request_data.chat_id then
        ngx.status = 400
        ngx.say(cjson.encode({error = "Missing chat_id"}))
        return
    end
    
    local chat_id = request_data.chat_id
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    -- Clear all data for this chat
    local chat_messages_key = "chat:messages:" .. USER_ID .. ":" .. chat_id
    local chat_artifacts_key = "chat:artifacts:" .. USER_ID .. ":" .. chat_id
    local chat_meta_key = "chat:meta:" .. USER_ID .. ":" .. chat_id
    local counter_admin_key = "chat:counter:" .. USER_ID .. ":" .. chat_id .. ":admin"
    local counter_jai_key = "chat:counter:" .. USER_ID .. ":" .. chat_id .. ":jai"
    
    -- Get all message and artifact IDs to delete individual records
    local message_ids = redis:lrange(chat_messages_key, 0, -1)
    local artifact_ids = redis:lrange(chat_artifacts_key, 0, -1)
    
    -- Delete individual messages
    if message_ids and type(message_ids) == "table" then
        for _, message_id in ipairs(message_ids) do
            local message_key = "message:" .. USER_ID .. ":" .. chat_id .. ":" .. message_id
            redis:del(message_key)
        end
    end
    
    -- Delete individual artifacts
    if artifact_ids and type(artifact_ids) == "table" then
        for _, artifact_id in ipairs(artifact_ids) do
            local artifact_key = "artifact:" .. USER_ID .. ":" .. chat_id .. ":" .. artifact_id
            redis:del(artifact_key)
        end
    end
    
    -- Delete list keys and metadata
    redis:del(chat_messages_key)
    redis:del(chat_artifacts_key)
    redis:del(chat_meta_key)
    redis:del(counter_admin_key)
    redis:del(counter_jai_key)
    
    redis_client.close(redis)
    ngx.say(cjson.encode({success = true}))
end

-- Delete a specific chat and all its data
function _M.handle_delete_chat()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say(cjson.encode({error = "Method not allowed"}))
        return
    end
    
    ngx.header["Content-Type"] = "application/json"
    
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    
    if not body then
        ngx.status = 400
        ngx.say(cjson.encode({error = "No request body"}))
        return
    end
    
    local ok, request_data = pcall(cjson.decode, body)
    if not ok or not request_data.chat_id then
        ngx.status = 400
        ngx.say(cjson.encode({error = "Missing chat_id"}))
        return
    end
    
    local chat_id = request_data.chat_id
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    -- Use same deletion logic as clear_chat
    local chat_messages_key = "chat:messages:" .. USER_ID .. ":" .. chat_id
    local chat_artifacts_key = "chat:artifacts:" .. USER_ID .. ":" .. chat_id
    local chat_meta_key = "chat:meta:" .. USER_ID .. ":" .. chat_id
    local counter_admin_key = "chat:counter:" .. USER_ID .. ":" .. chat_id .. ":admin"
    local counter_jai_key = "chat:counter:" .. USER_ID .. ":" .. chat_id .. ":jai"
    
    local message_ids = redis:lrange(chat_messages_key, 0, -1)
    local artifact_ids = redis:lrange(chat_artifacts_key, 0, -1)
    
    local deleted_items = 0
    
    -- Delete individual messages
    if message_ids and type(message_ids) == "table" then
        for _, message_id in ipairs(message_ids) do
            local message_key = "message:" .. USER_ID .. ":" .. chat_id .. ":" .. message_id
            deleted_items = deleted_items + redis:del(message_key)
        end
    end
    
    -- Delete individual artifacts
    if artifact_ids and type(artifact_ids) == "table" then
        for _, artifact_id in ipairs(artifact_ids) do
            local artifact_key = "artifact:" .. USER_ID .. ":" .. chat_id .. ":" .. artifact_id
            deleted_items = deleted_items + redis:del(artifact_key)
        end
    end
    
    -- Delete all chat keys
    deleted_items = deleted_items + redis:del(chat_messages_key)
    deleted_items = deleted_items + redis:del(chat_artifacts_key)
    deleted_items = deleted_items + redis:del(chat_meta_key)
    deleted_items = deleted_items + redis:del(counter_admin_key)
    deleted_items = deleted_items + redis:del(counter_jai_key)
    
    redis_client.close(redis)
    
    ngx.say(cjson.encode({
        success = true,
        deleted_count = deleted_items
    }))
end

-- Delete all chats for a user
function _M.handle_delete_all_chats()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say(cjson.encode({error = "Method not allowed"}))
        return
    end
    
    ngx.header["Content-Type"] = "application/json"
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    local deleted_count = 0
    
    -- Get all patterns for this user
    local patterns = {
        "message:" .. USER_ID .. ":*",
        "artifact:" .. USER_ID .. ":*",
        "chat:messages:" .. USER_ID .. ":*",
        "chat:artifacts:" .. USER_ID .. ":*",
        "chat:meta:" .. USER_ID .. ":*",
        "chat:counter:" .. USER_ID .. ":*"
    }
    
    for _, pattern in ipairs(patterns) do
        local keys = redis:keys(pattern)
        if keys and type(keys) == "table" then
            for _, key in ipairs(keys) do
                deleted_count = deleted_count + redis:del(key)
            end
        end
    end
    
    redis_client.close(redis)
    
    ngx.say(cjson.encode({
        success = true,
        deleted_count = deleted_count
    }))
end

-- Handle streaming chat with proper Redis storage and artifact generation
function _M.handle_chat_stream()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say("Method not allowed")
        return
    end
    
    -- Parse request body
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    
    if not body then
        ngx.status = 400
        ngx.say("No request body")
        return
    end
    
    local ok, request_data = pcall(cjson.decode, body)
    if not ok then
        ngx.status = 400
        ngx.say("Invalid JSON")
        return
    end
    
    local user_message = request_data.message or ""
    local files = request_data.files or {}
    local chat_id = request_data.chat_id  -- Now accepts chat_id from client
    
    -- If no chat_id provided, generate one server-side
    if not chat_id or chat_id == "" then
        chat_id = generate_chat_id()
        ngx.log(ngx.INFO, "Generated new chat_id: ", chat_id)
    end
    
    -- If no message and no files, return error
    if user_message == "" and #files == 0 then
        ngx.status = 400
        ngx.say("No message or files provided")
        return
    end
    
    -- Connect to Redis
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say("Redis connection failed")
        return
    end
    
    -- Generate admin message ID and save it
    local user_message_id = generate_message_id(redis, chat_id, "user")
    local complete_message = user_message
    local file_context = format_files_for_context(files)
    
    if file_context ~= "" then
        complete_message = complete_message .. file_context
    end
    
    -- Save user message
    save_message(redis, chat_id, user_message_id, "user", user_message, files, {})
    
    -- Get context for Ollama (last 10 messages)
    local context_messages = get_chat_context(redis, chat_id, 10)
    
    -- Add current message with file context to context
    table.insert(context_messages, {
        role = "user",
        content = complete_message
    })
    
    -- Set headers for Server-Sent Events
    ngx.header["Content-Type"] = "text/event-stream"
    ngx.header["Cache-Control"] = "no-cache"
    ngx.header["Connection"] = "keep-alive"
    ngx.header["Access-Control-Allow-Origin"] = "*"
    
    -- Send chat_id to client first
    ngx.say("data: " .. cjson.encode({chat_id = chat_id}) .. "\n")
    ngx.flush()
    
    -- Create HTTP client for Ollama
    local httpc = http.new()
    httpc:set_timeout(300000) -- 5 minutes
    
    -- Prepare Ollama request
    local ollama_data = {
        model = MODEL_NAME,
        messages = context_messages,
        stream = true,
        options = {
            temperature = MODEL_TEMPERATURE,
            top_p = MODEL_TOP_P,
            top_k = MODEL_TOP_K,
            num_ctx = MODEL_NUM_CTX,
            num_predict = MODEL_NUM_PREDICT
        }
    }
    
    -- Send request to Ollama
    local res, err = httpc:request_uri(MODEL_URL .. "/api/chat", {
        method = "POST",
        body = cjson.encode(ollama_data),
        headers = {
            ["Content-Type"] = "application/json"
        }
    })
    
    if not res then
        ngx.log(ngx.ERR, "Ollama request failed: ", err)
        ngx.say("data: " .. cjson.encode({error = "Failed to connect to AI model"}) .. "\n\n")
        ngx.flush()
        redis_client.close(redis)
        return
    end
    
    if res.status ~= 200 then
        ngx.log(ngx.ERR, "Ollama returned status: ", res.status)
        ngx.say("data: " .. cjson.encode({error = "AI model returned error: " .. res.status}) .. "\n\n")
        ngx.flush()
        redis_client.close(redis)
        return
    end
    
    -- Process streaming response
    local full_response = ""
    local lines = {}
    
    -- Split response into lines
    for line in res.body:gmatch("[^\r\n]+") do
        table.insert(lines, line)
    end
    
    -- Process each line from Ollama
    for _, line in ipairs(lines) do
        if line and line ~= "" then
            local ok_chunk, chunk_data = pcall(cjson.decode, line)
            if ok_chunk and chunk_data.message and chunk_data.message.content then
                local content = chunk_data.message.content
                full_response = full_response .. content
                
                -- Send chunk to client
                ngx.say("data: " .. cjson.encode({content = content}) .. "\n")
                ngx.flush()
                
                if chunk_data.done then
                    break
                end
            end
        end
    end
    
    -- Send completion signal
    ngx.say("data: [DONE]\n\n")
    ngx.flush()
    
    -- Generate JAI message ID and save response with artifacts
    local ai_message_id = generate_message_id(redis, chat_id, "assistant")
    
    -- Extract and save code blocks as artifacts
    local artifacts = extract_and_save_code_blocks(redis, chat_id, ai_message_id, full_response)
    
    -- Save AI message with artifact references
    save_message(redis, chat_id, ai_message_id, "assistant", full_response, {}, artifacts)
    
    redis_client.close(redis)
    httpc:close()
end

return _M