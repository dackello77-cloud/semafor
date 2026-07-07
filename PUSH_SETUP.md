# Remote push setup

Remote push is required when the customer app is closed. Local notifications only work after the app has already received the event.

## 1. Database

Run `supabase_schema.sql` again in Supabase SQL editor. It creates:

- `public.semafor_push_tokens`
- anon policies so the customer app can register its device token

## 2. Deploy Edge Function

```bash
supabase functions deploy send-customer-push
```

Set secrets:

```bash
supabase secrets set FCM_SERVICE_ACCOUNT_JSON='{"project_id":"...","client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"}'
supabase secrets set APNS_TEAM_ID='YOUR_APPLE_TEAM_ID'
supabase secrets set APNS_KEY_ID='YOUR_APNS_KEY_ID'
supabase secrets set APNS_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'
supabase secrets set APNS_BUNDLE_ID='com.semafor.customer'
supabase secrets set APNS_USE_SANDBOX='true'
```

Use `APNS_USE_SANDBOX=false` for TestFlight/App Store builds.

## 3. Android

Create Firebase project and Android app with package:

```text
com.semafor.customer
```

Download `google-services.json` and place it here:

```text
android/app/google-services.json
```

## 4. iOS

In Xcode, open:

```text
ios/App/App.xcodeproj
```

Enable these capabilities on the app target:

- Push Notifications
- Background Modes > Remote notifications

Create an APNs Auth Key in Apple Developer and use it for the Edge Function secrets above.

## 5. Sync/build

```bash
npm run build:mobile
npx cap sync android
npx cap sync ios
```

Remote push is sent when:

- admin clicks `BOL SEND`
- admin clicks `Finish`
