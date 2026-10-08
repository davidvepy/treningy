# Mobilné úpravy tréningovej aplikácie

## Pripravené v tejto zmene

- Náhľad každej jednotky bez vytvorenia session; štart je samostatná akcia.
- Kópia jednotky s novými identifikátormi a bez dňa v rozvrhu.
- Vyhľadávanie v existujúcej knižnici cvikov; tréningové parametre zostávajú nastaviteľné.
- Hromadné vyplnenie parametra v editore, s vrátením pred uložením.
- Väčšie dotykové ciele, 16 px vstupy, priblíženie stránky a viditeľnejší časovač.

Overenie: `node --test tests/mobile.test.cjs`. Test rozloženia: nainštalovaný Playwright a `node tests/mobile-layout.cjs`. Voliteľne PLAYWRIGHT_CHROME_PATH určuje lokálny prehliadač. Testy používajú syntetické dáta, nezapisujú do Supabase.

## iPhone: pauza na uzamknutej obrazovke

Aktuálny projekt je webová aplikácia. Live Activity vyžaduje natívnu iOS aplikáciu, ActivityKit a rozšírenie s WidgetKit/SwiftUI. Samotné pridanie webu na plochu tento mechanizmus neposkytuje.

Navrhované riešenie: ponechať webové rozhranie aj Supabase a pridať iOS obal s natívnym mostom pre časovač. Web odovzdá identifikátor session, názov cviku a absolútny koniec pauzy (`endsAt`). Natívna Live Activity zobrazuje systémový odpočet do tohto dátumu; nie je závislá od JavaScript intervalu na pozadí. Zmeny +30/−30 s aktualizujú dátum, preskočenie a dokončenie tréningu aktivitu ukončia. Pri návrate aplikácie sa stav zosúladí. Najprv verifikovať na fyzickom iPhone cez TestFlight, vrátane vypnutých Live Activities, uzamknutia, reštartu a uplynutia pauzy. Nevytvárať falošný odpočet cez prehrávanie zvuku alebo Media Session.

Dokumentácia: https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities

## Ďalšie časti odsúhlaseného smerovania

1. Trvalá lokálna fronta zmien sérií oddelená podľa používateľa. Synchronizácia s opakovaním, jasný stav uloženia a vyprázdnenie pred dokončením tréningu. Pri odhlásení nesmie dôjsť k odoslaniu dát pod iným účtom.
2. Databázové transakcie pre založenie session, kopírovanie a zmenu poradia. Aktuálne REST operácie pozostávajú z viacerých zápisov; zlyhanie posledného môže zanechať čiastočný stav.
3. Voliteľné návrhy progresie podľa dokončených pracovných sérií, stanoveného rozsahu, zaznamenaného RIR a nastaveného kroku váhy. Prijať po náhľade; žiadne automatické zvýšenie bez nastaveného pravidla. Zohľadniť rozdielne váhy jednotlivých sérií, náhrady cvikov a čiastočné tréningy.
4. Úpravy bežnou vetou pre jasne určené operácie, s validáciou a náhľadom pred uložením. Nikdy nevykonávať voľne generované SQL.
5. Jednorazové presuny v kalendári a kratšie varianty zostavené z vopred označených priorít cvikov.
6. Zjednotiť opakovane definované funkcie vo verziách training.js a plan-editor.js a presunúť opravy do hlavných modulov.

Tieto časti ani natívna iOS aplikácia ešte nie sú implementované v tejto zmene.
