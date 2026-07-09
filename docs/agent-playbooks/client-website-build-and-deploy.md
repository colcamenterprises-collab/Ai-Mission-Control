# Agent Playbook: Premium Client Website Build, Review, Deploy

## Purpose

This playbook documents the workflow used to build, polish, deploy and publish the HHA Buyers Agent website. It is designed so any future agent can repeat the process with less back-and-forth, fewer small patches, and clearer handoff between Cam, ChatGPT, Codex, James, Hostinger, GitHub and DNS providers.

Use this whenever a client website needs to be created or rebuilt from a design reference, deployed to Hostinger VPS, connected to a live domain, and polished through mobile/desktop review.

---

## Core Principle

Do not treat a client website as one giant vague prompt.

Treat it as a staged production workflow:

1. Capture business position.
2. Capture visual reference.
3. Build a strong first version.
4. Review visually on the real device.
5. Patch in grouped sections.
6. Deploy to staging/live.
7. Connect DNS and SSL.
8. Add final assets, logo, copy, footer and contact paths.
9. Produce a client review version.

The goal is not perfection in one pass. The goal is fast movement, controlled polish and no loop of doom.

---

## HHA Case Study Summary

### Client

HHA Buyers Agent

### Domain

`hhabuyersagent.com.au`

### GitHub repo used for website

`colcamenterprises-collab/HHA`

### Production Hostinger VPS IP

`76.13.189.158`

### Production VPS app path

`/opt/apps/hha`

### Public Nginx web root

`/var/www/html`

### Live URLs

- `https://hhabuyersagent.com.au`
- `https://www.hhabuyersagent.com.au`

### Design direction

Premium buyer's agent website. Apple/Mercedes-style minimalism. Crisp white, black, strong typography, rounded image frames, high-end property visuals, scroll reveals and premium interactive sections.

### Reference site

Homy Framer reference was used for:

- clean white header
- black contact CTA with white arrow square
- large rounded property image cards
- scroll-reveal quote section
- expanding video/media section
- premium minimal spacing

---

## Workflow Used

## 1. Confirm the Business Reality First

Before touching code, the agent must understand what the business actually is.

For HHA, the key correction was:

- Not a generic real estate agency.
- Not a rental listing website.
- Not a property development advisory business.
- It is a buyer's agent / buyer advocacy / property specialist business.

Website language must therefore speak to buyers, not sellers.

Good positioning language:

- buyer advocacy
- off-market search
- property search strategy
- negotiation support
- due diligence
- settlement support
- family homes
- investors
- relocation buyers
- first-home buyers

Avoid generic real-estate template language:

- sell your home
- rent a home
- listing marketplace
- agents for sellers
- search properties as if it is a portal

---

## 2. Use the Reference Site as Visual Direction, Not Copy

When Cam provides a reference site, study it for structure and design logic, not just surface content.

For Homy, the useful design mechanics were:

- crisp white header
- small uppercase navigation
- black contact pill/button
- white rounded arrow square inside the black CTA
- large hero image with rounded corners
- large quote reveal section
- section headlines with a mix of bold sans and script serif
- scroll-driven media reveal
- premium whitespace

Do not copy irrelevant real-estate content such as rentals or listing portal text.

---

## 3. Build in Sections, Then Polish in Passes

Recommended section order:

1. Header / navigation
2. Hero
3. Quote reveal / brand positioning
4. Buyer process
5. Market intelligence
6. Services
7. Due diligence
8. Why choose / proof logic
9. Opportunities or property visual section
10. Expanding video/media
11. Outcomes / FAQs
12. CTA modal
13. Footer

Avoid building dozens of unrelated effects at once.

---

## 4. Patch Strategy

Agents should avoid tiny single-line patches unless the change is risky.

Preferred patch grouping:

### Safe to bundle

- mobile spacing fixes
- broken anchor links
- button styling
- footer styling
- section heading typography
- simple copy changes
- card hover states
- CSS-only layout fixes

### Keep separate

- DNS changes
- SSL changes
- server config changes
- database changes
- moving media files onto VPS
- auth/routing changes
- large component rewrites

For HHA, good bundled patches included:

- service buttons + mobile hero + modal mobile layout + expanding media mobile fix
- hero heading + strategic services layout
- Why HHA heading + footer

---

## 5. GitHub Patch Workflow

Use GitHub as the source of truth.

### Standard process

1. Inspect current file.
2. Patch only relevant files.
3. Prefer additive CSS override files for fast visual polish.
4. Import new CSS last in `src/main.tsx` so it overrides earlier template styles.
5. Give Cam one deploy command bundle.

### Common files used in HHA

- `src/App.tsx`
- `src/main.tsx`
- `src/components/HeroSection.tsx`
- `src/components/Navbar.tsx`
- `src/components/ServicesSection.tsx`
- `src/components/AdvisorsSection.tsx`
- `src/components/WhySection.tsx`
- `src/components/StrategicSections.tsx`
- `src/components/SiteFooter.tsx`
- `src/data/siteData.ts`
- `src/finalPolish.css`
- `src/logoPolish.css`
- `src/processHover.css`
- `src/heroServicesLayout.css`
- `src/footerPolish.css`
- `src/quoteReveal.css`
- `src/expandingMedia.css`

### CSS rule

If the codebase already has layered CSS, final polish should be imported last.

Example:

```tsx
import './index.css';
import './fullWidth.css';
import './strategic.css';
import './quoteReveal.css';
import './expandingMedia.css';
import './finalPolish.css';
import './logoPolish.css';
import './processHover.css';
import './heroServicesLayout.css';
import './footerPolish.css';
```

This is not the cleanest long-term architecture, but it is a fast and controlled launch-polish method.

After client approval, a cleanup/refactor pass can consolidate CSS.

---

## 6. Local/Hostinger Deploy Command

For the HHA repo on Hostinger:

```bash
cd /opt/apps/hha

git pull origin main
npm run build

rm -rf /var/www/html/*
cp -r /opt/apps/hha/dist/* /var/www/html/

systemctl reload nginx || systemctl restart nginx
```

Then hard refresh:

```text
https://hhabuyersagent.com.au
```

If the build fails, Cam should paste the full terminal output back into the chat.

---

## 7. Nginx Config Pattern

For a static Vite/React site served from `/var/www/html`:

```nginx
server {
    listen 80;
    server_name hhabuyersagent.com.au www.hhabuyersagent.com.au;

    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Save under:

```bash
/etc/nginx/sites-available/hha
```

Enable:

```bash
ln -sf /etc/nginx/sites-available/hha /etc/nginx/sites-enabled/hha
nginx -t
systemctl reload nginx
```

---

## 8. GoDaddy DNS Pattern

If the domain stays on GoDaddy nameservers, do not change nameservers unless necessary.

Use GoDaddy DNS records:

```text
A       @      76.13.189.158
CNAME   www    hhabuyersagent.com.au.
```

Keep email records intact:

- MX
- TXT/SPF
- DKIM
- DMARC

For HHA, the old GoHighLevel A record was:

```text
A   @   34.68.234.4
```

That old A record had to be deleted because it conflicted with the Hostinger VPS target.

If GoDaddy says `www conflicts with another record`, check whether `www` is already a CNAME. Do not add an A record for `www` if the CNAME already points back to the root domain.

---

## 9. SSL with Certbot

After HTTP works, run:

```bash
certbot --nginx -d hhabuyersagent.com.au -d www.hhabuyersagent.com.au
```

Successful output should confirm HTTPS is enabled for both root and www.

Then test:

```bash
curl -I https://hhabuyersagent.com.au
curl -I https://www.hhabuyersagent.com.au
```

Expected response:

```text
HTTP/2 200
```

or a clean redirect.

---

## 10. Mobile Review Checklist

Always review on real mobile/tablet where possible.

For each pass, check:

- header does not crowd the page
- logo fits and is not too small or too large
- hero headline does not break into too many lines
- hero image appears in the first scroll range
- CTA button does not have unwanted shadow/glow
- services cards are grouped, not staggered with awkward gaps
- modal form is one column on mobile
- hover-only interactions have tap/focus fallbacks
- sticky scroll sections do not feel too long or jumpy
- footer does not feel like a bulky template footer

---

## 11. Common HHA Issues and Fixes

### Issue: Hero headline became too tall on tablet

Fix:

- force title to two visual lines
- avoid narrow grid column for heading
- reduce font clamp on tablet
- keep `Buy Better` and `With HHA` as separate block lines

### Issue: Strategic Services had awkward gaps

Fix:

- remove staggered template grid behaviour
- use a clean 2-column grouped grid on desktop/tablet
- use a single-column flow on mobile

### Issue: Process boxes looked good but were static

Fix:

- keep dimensions and placement
- on hover/focus, change white cards to black
- swap front text to summary text
- add mobile tap/active support

### Issue: Quote reveal felt too slow

Fix:

- reduce scroll height
- compress animation ranges
- reveal words faster so visitors do not feel trapped

### Issue: Expanding video felt jumpy on mobile

Fix:

- reduce mobile sticky section height
- use `100dvh` instead of `100vh`
- keep media inset or less aggressive on smaller screens

### Issue: GitHub attachment video works but is not production ideal

Fix:

- acceptable for demo
- for production, host MP4 locally under `/public/media`
- source should become `/media/hha-highlight.mp4`

---

## 12. Asset Handling

### Logos

Client logos should be added as public assets.

For HHA:

```text
public/hha-buyers-agent-logo-black.svg
```

Header then references:

```tsx
<img src="/hha-buyers-agent-logo-black.svg" alt="HHA Buyers Agent" />
```

### Videos

Temporary/testing method:

```tsx
const HIGHLIGHT_VIDEO_SRC = 'https://github.com/user-attachments/assets/...';
```

Production method:

```tsx
const HIGHLIGHT_VIDEO_SRC = '/media/hha-highlight.mp4';
```

Server path before build:

```bash
/opt/apps/hha/public/media/hha-highlight.mp4
```

---

## 13. Footer Pattern

For premium sites, use a simple footer instead of a bulky template footer.

HHA footer structure:

- logo bottom-left
- disclaimer right side
- phone icon and phone number link

Phone link:

```tsx
<a href="tel:+61412131818">+61 412 131 818</a>
```

Disclaimer pattern:

```text
Website information is general in nature and does not constitute financial, legal or property advice. Buyers should seek independent advice before making a purchase decision.
```

---

## 14. Agent Behaviour Rules for Cam Projects

### Do

- Work in practical patches.
- Bundle safe related fixes.
- Keep deployment commands copy/paste ready.
- Explain exactly what changed.
- Ask for screenshots after deploy.
- Preserve working sections unless Cam asks to change them.
- Use the live site and screenshots as the final truth.

### Do not

- Keep asking for approval on every small visual patch.
- Add unnecessary design features.
- Generate images unless Cam explicitly asks.
- Rebuild working sections from scratch without reason.
- Touch DNS/email records without explaining risk.
- Remove MX/TXT email records.
- Assume hover works on mobile without tap/focus support.
- Over-fragment patches into 6 separate PRs when one safe bundled patch is better.

---

## 15. Recommended Future Automation

Mission Control should eventually provide a `Website Launch Checklist` agent workflow:

1. Intake client brief.
2. Capture reference site.
3. Generate initial section map.
4. Build first version.
5. Deploy to staging.
6. Collect screenshot feedback.
7. Create bundled visual patch plan.
8. Apply patch.
9. Deploy.
10. Connect domain.
11. Issue SSL.
12. Produce client review summary.
13. Store final handoff notes.

---

## 16. Standard Final Deployment Message for Cam

Use this format after GitHub patches:

```bash
cd /opt/apps/hha

git pull origin main
npm run build

rm -rf /var/www/html/*
cp -r /opt/apps/hha/dist/* /var/www/html/

systemctl reload nginx || systemctl restart nginx
```

Then hard refresh:

```text
https://hhabuyersagent.com.au
```

If the build throws an error, paste the terminal output back into the chat.

---

## 17. Current HHA Status at Time of This Playbook

The HHA site has been:

- built in React/Vite
- published to Hostinger VPS
- connected to GoDaddy DNS
- moved away from old GoHighLevel A record
- secured with Let's Encrypt SSL
- polished with premium hero, quote reveal, grouped services, hover process cards, actual client logo, CTA modal, footer and contact phone link

The next work should focus on client-specific copy, verified testimonials, real imagery, proper service details and proof points.
