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

-- Generate Redis key for chat history
local function get_chat_key(chat_id)
    if chat_id and chat_id ~= "" then
        return "chat:history:" .. USER_ID .. ":" .. chat_id
    else
        -- Fallback to old format for compatibility
        return "chat:history:" .. USER_ID
    end
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

-- Get chat history from Redis
function _M.handle_chat_history()
    ngx.header["Content-Type"] = "application/json"
    
    -- Get chat_id from query parameter
    local args = ngx.req.get_uri_args()
    local chat_id = args.chat_id
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    local history_key = get_chat_key(chat_id)
    local messages_json = redis:get(history_key)
    
    redis_client.close(redis)
    
    local messages = {}
    if messages_json and messages_json ~= ngx.null then
        local ok, decoded = pcall(cjson.decode, messages_json)
        if ok then
            messages = decoded
        end
    end
    
    ngx.say(cjson.encode({messages = messages}))
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
    
    -- Get all chat keys for this user
    local pattern = "chat:history:" .. USER_ID .. ":*"
    local keys = redis:keys(pattern)
    
    local chats = {}
    
    if keys and type(keys) == "table" then
        for _, key in ipairs(keys) do
            -- Extract chat_id from key
            local chat_id = string.match(key, "chat:history:" .. USER_ID .. ":(.+)")
            
            if chat_id then
                local messages_json = redis:get(key)
                local message_count = 0
                local last_updated = nil
                local preview = ""
                
                if messages_json and messages_json ~= ngx.null then
                    local ok, messages = pcall(cjson.decode, messages_json)
                    if ok and type(messages) == "table" then
                        message_count = #messages
                        
                        -- Get last message for preview and timestamp
                        if message_count > 0 then
                            local last_message = messages[message_count]
                            if last_message.content then
                                preview = string.sub(last_message.content, 1, 100)
                            end
                            last_updated = last_message.timestamp or ngx.time()
                        end
                    end
                end
                
                table.insert(chats, {
                    id = chat_id,
                    message_count = message_count,
                    last_updated = last_updated or ngx.time(),
                    preview = preview
                })
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

-- Clear chat history
function _M.handle_clear_chat()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say(cjson.encode({error = "Method not allowed"}))
        return
    end
    
    ngx.header["Content-Type"] = "application/json"
    
    -- Parse request body to get chat_id
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    local chat_id = nil
    
    if body then
        local ok, request_data = pcall(cjson.decode, body)
        if ok and request_data.chat_id then
            chat_id = request_data.chat_id
        end
    end
    
    local redis = redis_client.connect()
    if not redis then
        ngx.status = 500
        ngx.say(cjson.encode({error = "Redis connection failed"}))
        return
    end
    
    local history_key = get_chat_key(chat_id)
    redis:del(history_key)
    
    redis_client.close(redis)
    
    ngx.say(cjson.encode({success = true}))
end

-- Delete a specific chat
function _M.handle_delete_chat()
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say(cjson.encode({error = "Method not allowed"}))
        return
    end
    
    ngx.header["Content-Type"] = "application/json"
    
    -- Parse request body to get chat_id
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
    
    local history_key = get_chat_key(chat_id)
    local result = redis:del(history_key)
    
    redis_client.close(redis)
    
    ngx.say(cjson.encode({
        success = true,
        deleted = result > 0
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
    
    -- Get all chat keys for this user
    local pattern = "chat:history:" .. USER_ID .. ":*"
    local keys = redis:keys(pattern)
    
    local deleted_count = 0
    
    if keys and type(keys) == "table" then
        for _, key in ipairs(keys) do
            local result = redis:del(key)
            if result > 0 then
                deleted_count = deleted_count + 1
            end
        end
    end
    
    -- Also delete the old format key for compatibility
    local old_key = "chat:history:" .. USER_ID
    local old_result = redis:del(old_key)
    if old_result > 0 then
        deleted_count = deleted_count + 1
    end
    
    redis_client.close(redis)
    
    ngx.say(cjson.encode({
        success = true,
        deleted_count = deleted_count
    }))
end

-- Handle streaming chat with file support and multi-chat
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
    local chat_id = request_data.chat_id
    
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
    
    -- Get existing conversation history for this specific chat
    local history_key = get_chat_key(chat_id)
    local existing_history = redis:get(history_key)
    
    local messages = {}
    if existing_history and existing_history ~= ngx.null then
        local ok, decoded = pcall(cjson.decode, existing_history)
        if ok then
            messages = decoded
        end
    end
    
    -- Prepare the complete user message with file context
    local complete_message = user_message
    local file_context = format_files_for_context(files)
    
    if file_context ~= "" then
        complete_message = complete_message .. file_context
    end
    
    -- Add user message to history
    local user_message_entry = {
        role = "user",
        content = user_message,
        files = files,
        timestamp = ngx.time()
    }
    table.insert(messages, user_message_entry)
    
    -- Prepare context for Ollama (last 10 messages, but include file context in the actual content)
    local context_messages = {}
    local start_idx = math.max(1, #messages - 9)
    
    for i = start_idx, #messages do
        local msg = messages[i]
        local role = msg.role == "user" and "user" or "assistant"
        local content = msg.content
        
        -- For the current user message, include file context
        if i == #messages and msg.role == "user" and file_context ~= "" then
            content = content .. file_context
        end
        
        table.insert(context_messages, {
            role = role,
            content = content
        })
    end
    
    -- Set headers for Server-Sent Events
    ngx.header["Content-Type"] = "text/event-stream"
    ngx.header["Cache-Control"] = "no-cache"
    ngx.header["Connection"] = "keep-alive"
    ngx.header["Access-Control-Allow-Origin"] = "*"
    
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
        return
    end
    
    if res.status ~= 200 then
        ngx.log(ngx.ERR, "Ollama returned status: ", res.status)
        ngx.say("data: " .. cjson.encode({error = "AI model returned error: " .. res.status}) .. "\n\n")
        ngx.flush()
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
            local ok, chunk_data = pcall(cjson.decode, line)
            if ok and chunk_data.message and chunk_data.message.content then
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
    
    -- Save assistant response to history
    table.insert(messages, {
        role = "ai",
        content = full_response,
        timestamp = ngx.time()
    })
    
    -- Save updated history to Redis with TTL
    redis:set(history_key, cjson.encode(messages))
    redis:expire(history_key, 86400 * 30) -- Expire after 30 days
    
    redis_client.close(redis)
    httpc:close()
end

return _M