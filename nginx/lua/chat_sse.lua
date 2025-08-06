local cjson = require "cjson"
local utils = require "chat_utils"

local _M = {}

-- Set up Server-Sent Events headers
function _M.setup_sse_headers()
    ngx.header["Content-Type"] = "text/event-stream"
    ngx.header["Cache-Control"] = "no-cache"
    ngx.header["Connection"] = "keep-alive"
    utils.set_cors_headers()
    
    utils.log_info("chat_sse", "setup_headers", "SSE headers configured")
end

-- Send SSE event with data
function _M.send_event(event_data, event_type)
    local data_str
    
    if type(event_data) == "table" then
        data_str = cjson.encode(event_data)
    else
        data_str = tostring(event_data)
    end
    
    if event_type then
        ngx.say("event: " .. event_type)
    end
    
    ngx.say("data: " .. data_str .. "\n")
    ngx.flush()
    
    utils.log_info("chat_sse", "send_event", {
        event_type = event_type,
        data_length = #data_str
    })
end

-- Send chat ID to client
function _M.send_chat_id(chat_id)
    _M.send_event({
        chat_id = chat_id,
        type = "chat_id"
    }, "chat_id")
end

-- Send content chunk to client
function _M.send_content_chunk(content)
    _M.send_event({
        content = content,
        type = "content"
    }, "content")
end

-- Send error to client
function _M.send_error(error_msg, details)
    local error_data = {
        error = error_msg,
        type = "error"
    }
    
    if details then
        error_data.details = details
    end
    
    _M.send_event(error_data, "error")
end

-- Send completion signal
function _M.send_completion()
    _M.send_event("[DONE]", "done")
    utils.log_info("chat_sse", "send_completion", "Stream completed")
end

-- Send status update
function _M.send_status(status, message)
    _M.send_event({
        status = status,
        message = message,
        type = "status",
        timestamp = ngx.time()
    }, "status")
end

-- Stream Ollama response chunks to client
function _M.stream_ollama_response(ollama_result)
    if not ollama_result or not ollama_result.chunks then
        _M.send_error("No response from AI service")
        return false
    end
    
    local total_chunks = #ollama_result.chunks
    
    utils.log_info("chat_sse", "stream_ollama_response", {
        chunk_count = total_chunks,
        full_response_length = ollama_result.full_response and #ollama_result.full_response or 0
    })
    
    -- Stream each chunk
    for i, chunk in ipairs(ollama_result.chunks) do
        if chunk.content and chunk.content ~= "" then
            _M.send_content_chunk(chunk.content)
            
            -- Add small delay to prevent overwhelming the client
            if i % 10 == 0 then
                ngx.sleep(0.001) -- 1ms delay every 10 chunks
            end
        end
        
        if chunk.done then
            break
        end
    end
    
    return true
end

-- Handle streaming chat request
function _M.handle_streaming_chat(chat_id, user_message, files, context_messages, ollama)
    -- Set up SSE
    _M.setup_sse_headers()
    
    -- Send chat ID immediately
    _M.send_chat_id(chat_id)
    
    -- Send status update
    _M.send_status("processing", "Generating response...")
    
    -- Prepare context with files
    local enhanced_context = ollama.prepare_context_with_files(context_messages, files)
    
    -- Add current message with file context to context
    local complete_message = user_message
    local file_context = utils.format_files_for_context(files)
    
    if file_context ~= "" then
        complete_message = complete_message .. file_context
    end
    
    table.insert(enhanced_context, {
        role = "user",
        content = complete_message
    })
    
    utils.log_info("chat_sse", "handle_streaming_chat", {
        chat_id = chat_id,
        context_size = #enhanced_context,
        files_count = files and #files or 0,
        message_length = #user_message
    })
    
    -- Stream response from Ollama
    local ollama_result, err = ollama.stream_chat(enhanced_context)
    
    if not ollama_result then
        local user_friendly_error = ollama.format_error(err)
        _M.send_error(user_friendly_error, err)
        utils.log_error("chat_sse", "handle_streaming_chat", "Ollama error", {
            error = err,
            chat_id = chat_id
        })
        return nil, err
    end
    
    -- Stream the response to client
    local stream_success = _M.stream_ollama_response(ollama_result)
    
    if stream_success then
        -- Send completion signal
        _M.send_completion()
        
        utils.log_info("chat_sse", "handle_streaming_chat", {
            chat_id = chat_id,
            response_length = #ollama_result.full_response,
            status = "completed"
        })
        
        return ollama_result.full_response, nil
    else
        _M.send_error("Failed to stream response")
        return nil, "Stream processing failed"
    end
end

-- Handle connection errors gracefully
function _M.handle_connection_error(error_msg)
    -- Log the error
    utils.log_error("chat_sse", "connection_error", error_msg)
    
    -- Try to send error if connection is still alive
    local ok, err = pcall(function()
        _M.send_error("Connection error", error_msg)
    end)
    
    if not ok then
        utils.log_error("chat_sse", "send_error_failed", "Could not send error to client: " .. tostring(err))
    end
end

-- Send heartbeat to keep connection alive
function _M.send_heartbeat()
    _M.send_event({
        type = "heartbeat",
        timestamp = ngx.time()
    }, "heartbeat")
end

-- Send progress update during long operations
function _M.send_progress(current, total, message)
    _M.send_event({
        type = "progress",
        current = current,
        total = total,
        percentage = math.floor((current / total) * 100),
        message = message or "",
        timestamp = ngx.time()
    }, "progress")
end

-- Send debug information (only in development)
function _M.send_debug(debug_data)
    if os.getenv("DEBUG_MODE") == "true" then
        _M.send_event({
            type = "debug",
            data = debug_data,
            timestamp = ngx.time()
        }, "debug")
    end
end

-- Handle client disconnect
function _M.handle_client_disconnect()
    utils.log_info("chat_sse", "client_disconnect", "Client disconnected during streaming")
    
    -- Cleanup any resources here
    -- This would be called if ngx.eof() returns true
end

-- Stream with rate limiting
function _M.stream_with_rate_limit(chunks, max_rate)
    max_rate = max_rate or 50 -- Default 50 chunks per second
    local delay = 1.0 / max_rate
    
    for i, chunk in ipairs(chunks) do
        _M.send_content_chunk(chunk.content)
        
        if i < #chunks then
            ngx.sleep(delay)
        end
        
        -- Check if client is still connected
        if ngx.eof() then
            _M.handle_client_disconnect()
            return false
        end
    end
    
    return true
end

-- Buffer multiple chunks before sending (for efficiency)
function _M.stream_buffered(chunks, buffer_size)
    buffer_size = buffer_size or 5
    local buffer = {}
    
    for i, chunk in ipairs(chunks) do
        table.insert(buffer, chunk.content)
        
        if #buffer >= buffer_size or i == #chunks then
            local combined_content = table.concat(buffer, "")
            _M.send_content_chunk(combined_content)
            buffer = {}
        end
    end
end

-- Stream with compression (if client supports it)
function _M.stream_compressed(content)
    local accept_encoding = ngx.var.http_accept_encoding or ""
    
    if string.find(accept_encoding, "gzip") then
        -- Note: OpenResty doesn't have built-in gzip for SSE
        -- This is a placeholder for future implementation
        utils.log_info("chat_sse", "compression", "Client supports gzip but not implemented for SSE")
    end
    
    _M.send_content_chunk(content)
end

-- Validate SSE connection
function _M.validate_connection()
    local accept = ngx.var.http_accept or ""
    local user_agent = ngx.var.http_user_agent or ""
    
    -- Check if client accepts event-stream
    if not string.find(accept, "text/event-stream") and not string.find(accept, "*/*") then
        utils.log_error("chat_sse", "validate_connection", "Client doesn't accept event-stream", {
            accept = accept,
            user_agent = user_agent
        })
        return false, "Client doesn't support Server-Sent Events"
    end
    
    return true, nil
end

-- Setup SSE with validation
function _M.setup_validated_sse()
    local valid, err = _M.validate_connection()
    if not valid then
        return false, err
    end
    
    _M.setup_sse_headers()
    return true, nil
end

return _M