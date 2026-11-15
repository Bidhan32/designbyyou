# Administrator authenticator setup

Before deploying, provision each existing admin and superadmin with a unique time-based authenticator key. Repeat this for newly created or promoted administrators. The operator responsible for production secrets provisions access.

1. In the production database, look up the intended administrator's user UUID. Confirm the account with its owner.
2. Run this command in a private local terminal once per administrator. It prints one random Base32 key.

   ```sh
   node -e "const c=require('node:crypto'); console.log(Array.from({length:32},()=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[c.randomInt(32)]).join(''))"
   ```

3. Transfer the key through an approved secret-sharing channel. Have the owner add it to their authenticator as a time-based account named DesignByYou, using six digits, SHA-1, and a 30-second interval. Keep a recovery copy in your restricted password vault.
4. Set the backend service secret `ADMIN_TOTP_KEYS` to a JSON object mapping each real UUID to its own key, for example `{"<user-uuid>":"<32-character-base32-key>"}`. Keep this out of Git, screenshots, tickets, and frontend variables. Preserve the other entries when updating one.
5. Deploy the frontend and API with the existing backend pre-deploy migration command. Confirm the journal entry for `0003_admin_mfa.sql`. Sign in with a dedicated admin account and verify access to the dashboard. To check freshness without moving money, open an individual manual payout's bank details after five minutes.

Existing admin sessions require a new sign-in. A missing key blocks that administrator. If an authenticator is lost, the operator verifies the owner's identity independently, provisions a new key, replaces the affected mapping and redeploys all API replicas. Sessions verified with the old key then require a new sign-in.
