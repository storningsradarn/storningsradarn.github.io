# Störningsradarn v3.3.3 – testgren, EJ publicerad

Denna gren är skapad utifrån `pages`, utan ändringar i den publika sidan. Filerna `index.html`, `app.js`, `live-data.js`, `contract.json` kommer från den användargodkända v3.3.3. `municipality-boundaries.geojson` innehåller 290 förenklade kommunpolygoner. Kontrollera gränsfilens källa, licens och aktualitet före skarp publicering.

## Testat 2026-11-23
- MapLibre-klick i Chromium med simulerad kartmotor: välj Malmö/Kristianstad, återklick, återställning och noll träffar; ingen automatisk zoomning vid kommunval.
- Senaste `pages/data/latest.json` och dess innehåll på tidpunkten 2026-11-23 12:56:48 UTC: 721 ärenden, 1 ändring, `baseline=false`, fem pilotkällor. Strukturellt validerade mot testgrenens `contract.json` utan schemabrott.
- Fullskalig autentisk karttjänst och automatisk skarp GitHub Pages-deploy återstår att verifiera efter samordning. Inga ändringar i `pages` gjorda.

## Före byte av aktiv sida
VPS-publiceraren verifierar statiska filers SHA-256 och en tillåten fillista. En direkt ändring av `pages` riskerar att stoppa den automatiska dataleveransen, särskilt när `municipality-boundaries.geojson` tillkommer. Hermes behöver därför anpassa publisherns statiska manifest/allowlist och godkänna uppsättningen i *separat utvecklingsmiljö*. Behåll den senaste fungerande piloten intakt tills releasen är synkroniserad. Ändra inte tokens, nycklar eller datahistorik. Den löpande insamlingen förblir AI-fri.

UI:s nuvarande strikta kontrakt gäller de fem pilotkällorna K020/K034/K036/K073/K117; utökning till fler källor är en **separat senare kontraktsändring**. Sidan ska använda `data/latest.json` med kontrollsummaverifierad snapshot, inte osäker dynamisk data eller testdata.

## Att kontrollera vid release
- `Läs in JSON` och kontrollvyn är dolda på publika webbplatsen.
- `Nya sedan förra hämtningen` läser endast `changes[].change === "new"` och beaktar `baseline`.
- Källpubliceringsdatum och `first_seen_at` visas som skilda begrepp.
- Karta visas även vid noll ärenden. Vald kommun styr listan utan att zooma om kartan.
- HTML, JS, JSON-kontrakt och kommungränser driftsätts som en samordnad, verifierad statisk release.
