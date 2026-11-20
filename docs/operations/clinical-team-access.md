# COMPASS clinical team access

## Browser access

Open the production pgAdmin site and sign in with the team's pgAdmin credentials. Under **Servers**, open **COMPASS DB (Read Only)**. When prompted for the PostgreSQL password, enter the password for the database role `clinical_teams`. Obtain both credentials through the team's approved password-sharing channel.

The registration connects to `prostatecancer_db_native` over loopback in the production deployment. The pgAdmin web login and PostgreSQL login have separate credentials. If pgAdmin cannot decrypt a saved password, clear the saved credential for the affected registration and reconnect using the database password.

## Data available to the team

As provisioned on 2026-11-20, the role can select the existing columns in 16 application tables in the public schema. These include survey responses, analysis results, recordings and activity logs. Account and API-key metadata are exposed through two views, `clinical_reporting.auth_user` and `clinical_reporting.auth_api_key`. Their definitions omit password and key hashes. Free text and attachments retain their original contents.

The grants use explicit columns. Review new tables and columns before extending team access. The application service account has a separate password and purpose.

## Verify a connection in Query Tool

Run the following as the team user. The first result should identify `clinical_teams` and `prostatecancer_db_native`. The second query should return a count. The last query should return false for every field.

```sql
SELECT current_user, current_database();

SELECT count(*) FROM public.patient_survey_submission_log;

SELECT
    has_any_column_privilege(current_user, 'public.patient_summary', 'INSERT') AS can_insert,
    has_any_column_privilege(current_user, 'public.patient_summary', 'UPDATE') AS can_update,
    has_table_privilege(current_user, 'public.patient_summary', 'DELETE') AS can_delete,
    has_column_privilege(current_user, 'public.auth_user', 'password_hash', 'SELECT') AS can_read_password_hash,
    has_column_privilege(current_user, 'public.auth_api_key', 'key_hash', 'SELECT') AS can_read_key_hash;
```

## DBeaver over VPN

The production deployment has a private TCP listener on port 15432. The proxy forwards PostgreSQL traffic to the native database. PostgreSQL requires TLS and SCRAM authentication for the team role on this path. The existing private port 5432 on the server's network interface continues to serve the pgAdmin HTTPS proxy.

Use the private endpoint and public CA certificate supplied by the operator, PostgreSQL SSL mode `verify-full`, and the team database credentials. The server-side test verified certificate identity, reached password authentication, and confirmed rejection of plaintext and administrator connections. During the November 20 test the VPN workstation timed out and the server observed no incoming handshake. Confirm VPN routing, the approved source IP and inbound rules before distributing this connection as available.

PostgreSQL grants, pgAdmin registrations, nginx configuration, host access controls and certificates are managed on the deployment. A Git checkout alone does not provision them. Keep credentials, private keys, backups and patient data outside the repository.
