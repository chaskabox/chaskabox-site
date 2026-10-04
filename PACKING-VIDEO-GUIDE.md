# 🎬 Packing Video Guide — Rameez ke liye

## 2 videos hain — dono ka tareeqa neeche hai

---

## PART A: Site wali video (homepage par "Dekho Kaise Pack Karte Hain!")

Ye video **ek baar** banao — site ke homepage par sab dekhenge.

### Kaise lagao?
**Option A — Video file (sab se asaan):**
1. Apni packing video phone se banao (neeche tareeqa)
2. File ka naam rakho: `packing.mp4`
3. Site ke files mein `videos` naam ka folder banao (agar nahi hai)
4. `packing.mp4` us folder mein rakho
5. `app.js` kholo, ye line dhoondo:
   ```js
   const PACKING_VIDEO = '';
   ```
6. Isko badal do:
   ```js
   const PACKING_VIDEO = 'videos/packing.mp4';
   ```
7. Deploy karo — video site par dikhegi! ✅

**Option B — YouTube:**
1. Video YouTube par upload karo (Unlisted rakhna)
2. Share → Embed par click karo, link copy karo
   - Jaise: `https://www.youtube.com/embed/AbC123xYz`
3. `app.js` mein:
   ```js
   const PACKING_VIDEO = 'https://www.youtube.com/embed/AbC123xYz';
   ```
4. Deploy karo ✅

> Jab tak video nahi lagate, site par khubsurat "🎬 Video jald aa raha hai!" placeholder dikhega — kuch tootega nahi.

---

## PART B: Har order ki PERSONAL packing video (customer ke liye!)

Jab customer checkout par **"🎬 Packing video chahiye?"** tick karega to:
- Tumhein **email** mein bara note milega: **"🎬 PACKING VIDEO REQUESTED!"**
- Admin panel ke Orders mein **🎬 VIDEO MANGI HAI!** badge dikhega
- Customer ka **WhatsApp number** wahan likha hoga

### Video kaise banao? (2 minute ka kaam)

**1. Tayyari (30 second)**
- Box khula rakho, saare products side par lagao
- Phone ko stable rakho — table par tikao ya kisi se pakadne ko kaho
- Roshni achi ho (din ki roshni best hai 💡)

**2. Recording shuru karo — ye bolo:**

> "Assalam-o-Alaikum **[customer ka naam]**! 🙌
> Main Rameez, ChaskaBox se!
> Ye hai aapka order **[order number]** — dekho main abhi pack kar raha hun!"

**3. Pack karte jao, dikhate jao (30-45 second)**
- Har product uthao, camera ko dikhao, naam bolo:
  - "Ye gaye aapke Top Pops... 🍭"
  - "Aur ye Winner Nimco... 😋"
- Sab box mein rakho
- Hand-written note dikhao: "Aur ye raha aapke liye mera personal note! ✍️"
- Box band karo, tape lagao

**4. Khatam karo:**
> "Ho gaya pack! 📦 Ab ye nikal raha hai delivery par.
> 4-7 din mein pohnch jayega. Shukriya ChaskaBox se order karne ka! 💛
> Allah Hafiz!"

**Total: 45-60 second. Bas!**

### Bhejo kaise?
1. Video WhatsApp par kholo
2. Customer ke number par bhejo (order email / admin panel mein likha hai)
3. Saath ye message likho:

> "Assalam-o-Alaikum [naam]! 📦
> Aapke order **[order number]** ki packing video! 🎬
> Rameez ne khud pack kiya hai. 4-7 din mein delivery ho jayegi!
> — ChaskaBox 💛"

### Tips ⭐
- ✅ Vertical video banao (phone seedha pakdo) — WhatsApp par best lagti hai
- ✅ Muskurahat ke saath bolo — customer aapko dekh raha hai!
- ✅ Naam zaroor lo — personal feel aata hai
- ❌ Gandi/andi jagah par mat banao
- ❌ 2 minute se lambi video mat banao (WhatsApp par bhejne mein mushkil)

---

## Customer ko kya dikhega? (uski taraf se)

1. **Checkout par:** "🎬 Packing video chahiye? (FREE!)" checkbox
2. **Order ke baad:** "🎬 Rameez aapke order ki packing video banakar WhatsApp par bhejega!"
3. **Account → Orders mein:** 🎬 "Packing video" chip + status (🕐 → ✅ → 📦 → 🎬 → 🚚 → 📬)

---

**Ye feature ChaskaBox ko UNIQUE banata hai — Daraz, YumTreats, CheezWala koi ye nahi karta! 🌟**
