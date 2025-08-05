local redis = require "resty.redis"

local _M = {}

-- Configuration
local REDIS_HOST = os.getenv("REDIS_HOST") or "redis"
local REDIS_PORT = tonumber(os.getenv("REDIS_PORT") or "6379")

-- Connect to Redis
function _M.connect()
    local red = redis:new()
    
    red:set_timeouts(1000, 1000, 1000) -- 1 second timeouts
    
    local ok, err = red:connect(REDIS_HOST, REDIS_PORT)
    if not ok then
        ngx.log(ngx.ERR, "Failed to connect to Redis: ", err)
        return nil
    end
    
    return red
end

-- Close Redis connection
function _M.close(red)
    if red then
        local ok, err = red:set_keepalive(10000, 100)
        if not ok then
            ngx.log(ngx.ERR, "Failed to set Redis keepalive: ", err)
            red:close()
        end
    end
end

return _M