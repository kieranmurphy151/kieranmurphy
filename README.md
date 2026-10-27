# kieranmurphy.ie

Kieran Murphy's personal site: a menu home page, the Pre-Hospital, Surf and UX/UI portfolios,
and links to the CPG Drill, Watchkeeping Drill and Elemental revision apps.
Plain HTML and CSS, no build step. GitHub Pages serves this folder as it is.

## Publish it on GitHub Pages

1. Sign in at github.com (or create a free account). Your username becomes part of your temporary
   address: `USERNAME.github.io`.
2. Create a new repository named exactly `USERNAME.github.io` (your username, then `.github.io`).
   Set it to **Public** and don't add a README.
3. Add these files with **GitHub Desktop** (desktop.github.com). The browser uploads only 100 files
   at a time and this site has more, so Desktop is easier:
   - File > Clone repository > choose `USERNAME.github.io`.
   - Copy everything in this folder (index.html, images, files and the rest) into the cloned folder.
   - Type a summary such as `First version`, click **Commit to main**, then **Push origin**.
4. In the repository on github.com: **Settings > Pages**. Under "Build and deployment" set Source to
   **Deploy from a branch**, branch **main**, folder **/ (root)**, and save.
   After a minute or two the site is live at `https://USERNAME.github.io`. Check it there first.

## Move kieranmurphy.ie across

5. Find out who manages the domain: search `kieranmurphy.ie` in the WHOIS lookup on weare.ie.
   It shows the registrar and the name servers. Your DNS records are edited wherever those name
   servers point (Weebly, or a registrar such as Blacknight).
6. Before changing anything, write down the current DNS records. Keep any **MX** records and
   email-related **TXT** records exactly as they are, or email on the domain stops working.
7. Verify the domain with GitHub first (recommended by GitHub to prevent takeovers):
   your profile picture > **Settings > Pages > Add a domain**, enter `kieranmurphy.ie`, add the
   TXT record GitHub shows you at your DNS provider, then click **Verify**.
8. In the repository: **Settings > Pages > Custom domain**, enter `kieranmurphy.ie` and save.
   (This adds a file named CNAME to the repository. Leave it there.)
9. At your DNS provider, remove the old records for `@` and `www` that point at Weebly, then add:

   | Type  | Name | Value                  |
   |-------|------|------------------------|
   | A     | @    | 185.199.108.153        |
   | A     | @    | 185.199.109.153        |
   | A     | @    | 185.199.110.153        |
   | A     | @    | 185.199.111.153        |
   | CNAME | www  | USERNAME.github.io     |

   Optional IPv6 (AAAA, name @): 2606:50c0:8000::153, 2606:50c0:8001::153,
   2606:50c0:8002::153, 2606:50c0:8003::153. Don't add wildcard (`*`) records.
10. Wait. DNS can take up to 24 hours. When kieranmurphy.ie shows the new site, go back to
    **Settings > Pages** and tick **Enforce HTTPS** (that option can also take up to 24 hours to appear).
11. Only then cancel the Weebly plan. If Weebly is also your domain's registrar, transfer the
    domain to another registrar first so you don't lose it when the plan ends.

## Updating the site later

Change the files in your GitHub Desktop folder, then **Commit to main** and **Push origin**.
The live site updates within a minute or two.

## Retire the old app addresses (after kieranmurphy.ie is live)

CPG Drill and Watchkeeping Drill used to live on Netlify. `netlify-moved-pages.zip` has one folder
for each. Open that app's site on app.netlify.com, go to **Deploys**, and drag its folder
(`cpg-drill-moved` or `watchkeeping-drill-moved`) onto the deploy area. From then on the old address
sends people to the new one and carries their saved progress across. Anyone who added Watchkeeping
Drill to their home screen should add it again from the new address.

## Folders

- `cpg-drill`, `watchkeeping-drill`, `elemental`: the three revision apps
- `images/cpd`, `images/surf`, `images/uxui`: photos and screenshots from the old site
- `files`: the PDFs from the Interaction Design project
