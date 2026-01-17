# Default Tenant

```
POST

## /tenants/default-tenant
```

Sets the tenant specified in the request body as the default one, resolving all the incoming API request to that tenant when the env `SINGLE_TENANT_MODE` is set to true. Once set, the default tenant can be overwritten but never unset, although it is only effective when `SINGLE_TENANT_MODE` is set to true.

Default tenant is useful for development purposes or when the SDP is used by a single organization. This allows the organization to skip specifying the tenant in every request and simplifies the SDP setup operationally by removing the need of providing wildcard TLS certificates for multi-tenant configurations.

## Request[](#request "Direct link to Request")

## Responses[](#responses "Direct link to Responses")

* 201
* 401
* 403

Default tenant details

Unauthorized

Forbidden