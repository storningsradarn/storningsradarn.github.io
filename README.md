# Störningsradarn

Förberedd redaktionell översikt för organisationen storningsradarn.
Webbadress: https://storningsradarn.github.io/
Repository: storningsradarn/storningsradarn.github.io
Administrerande konto: kaktahir, med rollen ägare i organisationen.
Publiceringsgren: pages, rotmappen.

## Data

Webbplatsen läser data/latest.json och validerade JSON-filer i data/snapshots.
Sidan kontrollerar nya data varje minut när fliken är synlig. Insamlarens
planerade intervall är två timmar. Efter tre timmar utan lyckad insamling
markeras informationen som föråldrad. Sparade testdata märks alltid INTE LIVE.
Ett misslyckat försök behåller föregående giltiga export.

## Lokal öppning utan installation

Packa upp hela mappen. Dubbelklicka på index.html. Välj Läs in JSON och öppna
Sparade-testdata.json i leveranspaketet. Direktöppnade HTML-filer får normalt
inte hämta JSON automatiskt; filväljaren är det avsiktliga lokala läget.
Automatisk uppdatering testas när sidan serveras över HTTP eller HTTPS.
Kartbakgrunden kräver internet och en webbläsare som stöder WebGL.
Markörerna visar ungefärliga kommuncentrum, aldrig exakta händelseplatser.

## Egna ärenden

Mina ärenden lagras bara i denna webbläsares lokala lagring. De ingår inte i
exporten eller publiceringen. Exportera en kopia för att flytta dem. Sparade
ärenden under en lokal filadress följer inte automatiskt med till webbplatsen.

Detta är förberedelsematerial, inte ett påstående om publicering eller pilotstart.
