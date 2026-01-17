# Admin (Tenant Management)

The Admin API oversees the management of tenants within the system, facilitating tasks such as provisioning new tenants, updating their information, and retrieving tenant data.

[## ðï¸ Get All Tenants

Get All Tenants](/docs/platforms/stellar-disbursement-platform/api-reference/get-all-tenants.md)

[## ðï¸ Create Tenant

Create Tenant](/docs/platforms/stellar-disbursement-platform/api-reference/create-tenant.md)

[## ðï¸ Retrieve a Tenant

Retrieve a Tenant](/docs/platforms/stellar-disbursement-platform/api-reference/retrieve-a-tenant.md)

[## ðï¸ Soft delete a Tenant

Soft delete a Tenant](/docs/platforms/stellar-disbursement-platform/api-reference/soft-delete-a-tenant.md)

[## ðï¸ Update a Tenant

This endpoint updates the Tenant data.](/docs/platforms/stellar-disbursement-platform/api-reference/update-a-tenant.md)

[## ðï¸ Default Tenant

Sets the tenant specified in the request body as the default one, resolving all the incoming API request to that tenant when the env `SINGLE\_TENANT\_MODE` is set to true. Once set, the default tenant can be overwritten but never unset, although it is only effective when `SINGLE\_TENANT\_MODE` is set to true.](/docs/platforms/stellar-disbursement-platform/api-reference/default-tenant.md)