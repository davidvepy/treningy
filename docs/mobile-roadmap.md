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

## Súčasť finálnej webovej úpravy

- Trvalá lokálna fronta zmien existujúcich sérií, oddelená podľa účtu. Kontrola potvrdenia databázou, obnovenie po načítaní, opakovanie po pripojení a blokovanie dokončenia, kým existujú neodoslané zmeny. Vytvorenie nového tréningu a načítanie aplikácie stále vyžadujú internet.
- Voliteľné návrhy progresie podľa vlastného kroku cviku, počtu dokončených pracovných sérií, hornej hranice opakovaní a RIR poslednej série. Návrh sa prijíma explicitne v náhľade; čiastočné tréningy, rozdielne váhy, legacy dáta a chýbajúca rezerva návrh nevytvoria.
- Predvyplnenie jednotlivých pracovných sérií zachová ich vlastné váhy a ignoruje drop série. Neskoršia manuálna úprava plánu má prednosť.
- Jednoduché úpravy vetou pre pauzu, série a váhu všetkých cvikov v jednotke. Rozpoznávajú konkrétne príkazy a pripravia náhľad bez priameho zápisu do databázy. Nie je to generatívny AI editor.
- Odstránenie 16 zastaraných duplicitných definícií v training.js a plan-editor.js.
- Obnova prihlásenia sa zdieľa medzi súbežnými požiadavkami; výpadok siete používateľa neodhlási a oneskorená obnova po odhlásení nemôže obnoviť starý účet.

Overenie: 19 automatických testov plus mobilný test rozloženia a celého toku so syntetickou databázou (kópia, knižnica, hromadná zmena a vrátenie, štart, offline zmena série a opakované odoslanie, história, progres a profil). Šírky 320, 375, 390 a 430 px. Testy nezapisujú do produkčného Supabase. Zatiaľ nebolo vykonané overenie na fyzickom iPhone ani integračné zapisovanie s používateľovým produkčným prihlásením.

## Neskoršie rozšírenia

- Natívny iOS obal a Live Activities podľa návrhu vyššie.
- Plne offline spustenie webu, nové tréningy bez siete a synchronizácia medzi viacerými súbežne otvorenými kartami.
- Databázové transakcie pre založenie session, kopírovanie a zmenu poradia. Táto verzia má kompenzačné čistenie neúplného nového tréningu; viaceré REST zápisy stále nie sú jednou transakciou.
- Jednorazové presuny v kalendári a automatické kratšie varianty podľa používateľom určených priorít. Aktuálne môže používateľ kopírovať jednotku a upraviť jej cviky aj dni.
- Rozšírené generatívne úpravy plánu s validovaným náhľadom a verziami.
