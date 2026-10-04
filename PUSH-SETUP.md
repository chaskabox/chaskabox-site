# 🔔 OneSignal Web Push — Setup Guide (ChaskaBox)

**Time:** ~15 minutes | **Cost:** FREE (up to 10,000 subscribers)

Web push notifications se aap customers ko deals, sales aur new products ki khabar bhej sakte hain — bina WhatsApp ya SMS ke!

---

## Step 1: OneSignal Account (FREE)

1. **onesignal.com** par jayein → **Sign Up** (free)
2. Login ke baad **"New App/Website"** par click karein
3. App ka naam: **ChaskaBox**
4. Platform: **Web** choose karein

## Step 2: Web Push Configure

1. **"Web Push"** select karein
2. **Site URL:** `https://chaskabox.online` likhein
3. **Auto Resubscribe:** ON rakhein
4. **"Save"** karein

## Step 3: App ID Copy karein

1. OneSignal dashboard → **Settings → Keys & IDs**
2. **"OneSignal App ID"** copy karein (jaise: `a1b2c3d4-...`)

## Step 4: Site mein lagayein

**2 jagah App ID dalni hai:**

### A) index.html (uncomment karein)
`index.html` mein ye commented code dhoondein:
```html
<!-- OneSignal Web Push (setup: PUSH-SETUP.md — uncomment + add App ID when ready)
```
- `<!--` aur `-->` hatayein (uncomment)
- `YOUR-ONESIGNAL-APP-ID` ki jagah apni App ID lagayein

### B) retention.js
`retention.js` mein ye line dhoondein:
```js
var ONESIGNAL_APP_ID = ''; // Rameez: apni App ID yahan ...
```
- Apni App ID quotes ke andar lagayein:
```js
var ONESIGNAL_APP_ID = 'a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

## Step 5: Deploy karein

```bash
cd ~/workspace/chaskabox-static
git add -A
git commit -m "OneSignal push enabled"
git push origin main
```

Cloudflare 2-3 min mein deploy karega.

## Step 6: Test karein

1. Site kholein (2nd visit par prompt aayega)
2. **"Enable"** dabayein → browser permission **"Allow"** karein
3. OneSignal dashboard → **Messages → New Push** → test message bhejein
4. Phone/computer par notification aana chahiye! 🎉

---

## Kya hoga setup ke baad?

- **2nd visit** par user ko soft prompt: *"🔔 Deals miss na karein! Notifications on karein"*
- User **Allow** karega → subscriber ban jayega
- Aap OneSignal dashboard se **kabhi bhi** message bhej sakte hain:
  - 🔥 Flash sale alerts
  - 🎁 New product arrivals
  - 💰 Discount codes
  - 🎂 Festival offers (Eid, etc.)

## Important Notes

- **HTTPS zaroori hai** — chaskabox.online par hai ✅
- **iOS Safari:** iOS 16.4+ par kaam karta hai (user ko site Home Screen par add karni hogi)
- **Free limit:** 10,000 subscribers — iske baad paid plan
- **Spam mat karein:** Hafte mein 1-2 messages max, warna log unsubscribe kar denge!

## Troubleshooting

| Masla | Hal |
|---|---|
| Prompt nahi aa raha | 2nd visit par aata hai; `cb_visits` check karein |
| "Allow" ke baad bhi nahi aa raha | Browser settings → site permissions → notifications Allow karein |
| Test message nahi pahuncha | 5-10 min wait karein; OneSignal dashboard mein "Delivered" check karein |

---

**Bina setup ke:** Kuch nahi tootega! Code gracefully skip ho jayega — prompt sirf tab aayega jab App ID configured ho. ✅
