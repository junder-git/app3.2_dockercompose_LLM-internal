local http = require "resty.http"
local cjson = require "cjson"
local utils = require "chat_utils"

local _M = {}

-- Create HTTP client for Ollama requests
function _M.create_client()
    local httpc = http.new()
    httpc:set_timeout(300000) -- 5 minutes timeout for AI responses
    return httpc
end

-- Prepare Ollama request payload
function _M.prepare_request(context_messages, options)
    local request_data = {
        model = utils.MODEL_NAME,
        messages = context_messages,
        stream = true,
        options = {
            temperature = options and options.temperature or utils.MODEL_TEMPERATURE,
            top_p = options and options.top_p or utils.MODEL_TOP_P,
            top_k = options and options.top_k or utils.MODEL_TOP_K,
            num_ctx = options and options.num_ctx or utils.MODEL_NUM_CTX,
            num_predict = options and options.num_predict or utils.MODEL_NUM_PREDICT
        }
    }
    
    utils.log_info("chat_ollama", "prepare_request", {
        model = request_data.model,
        message_count = #context_messages,
        options = request_data.options
    })
    
    return request_data
end

-- Send request to Ollama API
function _M.send_request(httpc, request_data)
    local url = utils.MODEL_URL .. "/api/chat"
    
    utils.log_info("chat_ollama", "send_request", {
        url = url,
        model = request_data.model,
        stream = request_data.stream
    })
    
    local res, err = httpc:request_uri(url, {
        method = "POST",
        body = cjson.encode(request_data),
        headers = {
            ["Content-Type"] = "application/json"
        }
    })
    
    if not res then
        utils.log_error("chat_ollama", "send_request", "Request failed", {
            error = err,
            url = url
        })
        return nil, "Failed to connect to Ollama: " .. (err or "unknown error")
    end
    
    if res.status ~= 200 then
        local error_body = res.body and res.body:sub(1, 200) or "No response body"
        utils.log_error("chat_ollama", "send_request", "HTTP error", {
            status = res.status,
            body = error_body,
            url = url
        })
        return nil, "Ollama returned HTTP " .. res.status .. ": " .. error_body
    end
    
    utils.log_info("chat_ollama", "send_request", {
        status = res.status,
        response_length = res.body and #res.body or 0
    })
    
    return res, nil
end

-- Parse streaming response from Ollama
function _M.parse_streaming_response(response_body)
    local full_response = ""
    local lines = {}
    
    -- Split response into lines
    for line in response_body:gmatch("[^\r\n]+") do
        table.insert(lines, line)
    end
    
    utils.log_info("chat_ollama", "parse_streaming_response", {
        line_count = #lines
    })
    
    local chunks = {}
    
    -- Process each line from Ollama
    for _, line in ipairs(lines) do
        if line and line ~= "" then
            local ok_chunk, chunk_data = pcall(cjson.decode, line)
            if ok_chunk and chunk_data.message and chunk_data.message.content then
                local content = chunk_data.message.content
                full_response = full_response .. content
                
                table.insert(chunks, {
                    content = content,
                    done = chunk_data.done or false
                })
                
                if chunk_data.done then
                    break
                end
            elseif ok_chunk and chunk_data.error then
                utils.log_error("chat_ollama", "parse_streaming_response", "Ollama error", {
                    error = chunk_data.error
                })
                return nil, nil, "Ollama error: " .. chunk_data.error
            end
        end
    end
    
    utils.log_info("chat_ollama", "parse_streaming_response", {
        full_response_length = #full_response,
        chunk_count = #chunks
    })
    
    return full_response, chunks, nil
end

-- Validate Ollama model configuration
function _M.validate_config()
    local issues = {}
    
    if not utils.MODEL_URL or utils.MODEL_URL == "" then
        table.insert(issues, "MODEL_URL is not configured")
    end
    
    if not utils.MODEL_NAME or utils.MODEL_NAME == "" then
        table.insert(issues, "MODEL_NAME is not configured")
    end
    
    if utils.MODEL_TEMPERATURE < 0 or utils.MODEL_TEMPERATURE > 2 then
        table.insert(issues, "MODEL_TEMPERATURE should be between 0 and 2")
    end
    
    if utils.MODEL_TOP_P < 0 or utils.MODEL_TOP_P > 1 then
        table.insert(issues, "MODEL_TOP_P should be between 0 and 1")
    end
    
    if utils.MODEL_NUM_CTX <= 0 then
        table.insert(issues, "MODEL_NUM_CTX should be positive")
    end
    
    if #issues > 0 then
        utils.log_error("chat_ollama", "validate_config", "Configuration issues", {
            issues = issues
        })
        return false, issues
    end
    
    return true, nil
end

-- Test Ollama connection and model availability
function _M.health_check()
    local httpc = _M.create_client()
    
    -- Check if Ollama is responding
    local res, err = httpc:request_uri(utils.MODEL_URL .. "/api/tags", {
        method = "GET",
        headers = {
            ["Content-Type"] = "application/json"
        }
    })
    
    httpc:close()
    
    if not res then
        utils.log_error("chat_ollama", "health_check", "Connection failed", {
            error = err,
            url = utils.MODEL_URL
        })
        return false, "Cannot connect to Ollama: " .. (err or "unknown error")
    end
    
    if res.status ~= 200 then
        utils.log_error("chat_ollama", "health_check", "HTTP error", {
            status = res.status,
            url = utils.MODEL_URL
        })
        return false, "Ollama returned HTTP " .. res.status
    end
    
    -- Parse response to check available models
    local ok, models_data = pcall(cjson.decode, res.body)
    if not ok then
        utils.log_error("chat_ollama", "health_check", "Invalid response", {
            body = res.body and res.body:sub(1, 200) or "empty"
        })
        return false, "Invalid response from Ollama"
    end
    
    -- Check if our configured model is available
    local model_found = false
    if models_data.models then
        for _, model in ipairs(models_data.models) do
            if model.name == utils.MODEL_NAME then
                model_found = true
                break
            end
        end
    end
    
    if not model_found then
        utils.log_error("chat_ollama", "health_check", "Model not found", {
            configured_model = utils.MODEL_NAME,
            available_models = models_data.models
        })
        return false, "Model '" .. utils.MODEL_NAME .. "' not found in Ollama"
    end
    
    utils.log_info("chat_ollama", "health_check", {
        status = "healthy",
        model = utils.MODEL_NAME,
        available_models_count = models_data.models and #models_data.models or 0
    })
    
    return true, "Ollama is healthy and model is available"
end

-- Stream chat completion
function _M.stream_chat(context_messages, options)
    -- Validate configuration
    local config_valid, config_issues = _M.validate_config()
    if not config_valid then
        return nil, "Configuration error: " .. table.concat(config_issues, ", ")
    end
    
    -- Create HTTP client
    local httpc = _M.create_client()
    
    -- Prepare request
    local request_data = _M.prepare_request(context_messages, options)
    
    -- Send request
    local response, err = _M.send_request(httpc, request_data)
    if not response then
        httpc:close()
        return nil, err
    end
    
    -- Parse streaming response
    local full_response, chunks, parse_err = _M.parse_streaming_response(response.body)
    httpc:close()
    
    if parse_err then
        return nil, parse_err
    end
    
    return {
        full_response = full_response,
        chunks = chunks,
        model = utils.MODEL_NAME,
        options = request_data.options
    }, nil
end

-- Get model information
function _M.get_model_info()
    local httpc = _M.create_client()
    
    local res, err = httpc:request_uri(utils.MODEL_URL .. "/api/show", {
        method = "POST",
        body = cjson.encode({ name = utils.MODEL_NAME }),
        headers = {
            ["Content-Type"] = "application/json"
        }
    })
    
    httpc:close()
    
    if not res then
        return nil, "Failed to get model info: " .. (err or "unknown error")
    end
    
    if res.status ~= 200 then
        return nil, "HTTP " .. res.status .. " from Ollama"
    end
    
    local ok, model_data = pcall(cjson.decode, res.body)
    if not ok then
        return nil, "Invalid response from Ollama"
    end
    
    return model_data, nil
end

-- Format error message for user display
function _M.format_error(error_msg)
    if not error_msg then
        return "Unknown error occurred"
    end
    
    -- Connection errors
    if string.find(error_msg, "connection refused") or 
       string.find(error_msg, "timeout") or
       string.find(error_msg, "connect") then
        return "Cannot connect to AI service. Please check if Ollama is running."
    end
    
    -- Model errors
    if string.find(error_msg, "model") and string.find(error_msg, "not found") then
        return "AI model not available. Please check Ollama configuration."
    end
    
    -- HTTP errors
    if string.find(error_msg, "HTTP 4") then
        return "Invalid request to AI service. Please try again."
    end
    
    if string.find(error_msg, "HTTP 5") then
        return "AI service error. Please try again in a moment."
    end
    
    -- Configuration errors
    if string.find(error_msg, "Configuration error") then
        return "AI service configuration error. Please contact administrator."
    end
    
    -- Generic fallback
    return "AI service error: " .. error_msg
end

-- Prepare context with file content
function _M.prepare_context_with_files(messages, files)
    local context_messages = {}
    
    -- Copy existing messages
    for _, msg in ipairs(messages) do
        table.insert(context_messages, {
            role = msg.role,
            content = msg.content
        })
    end
    
    -- Add file context to the last user message if files are provided
    if files and #files > 0 then
        local file_context = utils.format_files_for_context(files)
        if file_context ~= "" and #context_messages > 0 then
            local last_message = context_messages[#context_messages]
            if last_message.role == "user" then
                last_message.content = last_message.content .. file_context
            end
        end
    end
    
    return context_messages
end

-- Get default model options
function _M.get_default_options()
    return {
        temperature = utils.MODEL_TEMPERATURE,
        top_p = utils.MODEL_TOP_P,
        top_k = utils.MODEL_TOP_K,
        num_ctx = utils.MODEL_NUM_CTX,
        num_predict = utils.MODEL_NUM_PREDICT
    }
end

-- Create a simple completion (non-streaming)
function _M.simple_completion(prompt, options)
    local context_messages = {
        { role = "user", content = prompt }
    }
    
    local request_data = _M.prepare_request(context_messages, options)
    request_data.stream = false -- Override for simple completion
    
    local httpc = _M.create_client()
    local response, err = _M.send_request(httpc, request_data)
    httpc:close()
    
    if not response then
        return nil, err
    end
    
    local ok, result = pcall(cjson.decode, response.body)
    if not ok then
        return nil, "Invalid response from Ollama"
    end
    
    if result.message and result.message.content then
        return result.message.content, nil
    end
    
    return nil, "No content in Ollama response"
end

return _M