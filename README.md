# Tréningy

Osobný mobilný tréningový denník s dátami v Supabase.

## Nové používanie

- Kliknutie na jednotku otvorí náhľad. Tréning vytvorí až tlačidlo **Začať tento tréning**.
- V náhľade môžeš vytvoriť kópiu alebo otvoriť editor.
- Editor obsahuje vyhľadávanie cvikov, hromadné vyplnenie parametrov a príkazy ako **Nastav pauzu na 90 sekúnd**. Pripravené hodnoty skontroluj a ulož celú jednotku.
- V ďalších nastaveniach cviku môžeš zapnúť návrhy zvýšenia váhy a určiť vlastný krok. Po tréningu zaznamenaj rezervu poslednej série (RIR); návrhy nájdeš v náhľade a prijímaš ich samostatne.
- Série sa ukladajú najprv do zariadenia a odosielajú do databázy. Aktívny tréning zobrazuje stav uloženia. Nový tréning a načítanie stránky vyžadujú internet.

## Overenie

`node --test tests/*.test.cjs`

Pre kontrolu mobilného rozloženia a toku nainštaluj Playwright a spusti `node tests/mobile-layout.cjs`. PLAYWRIGHT_CHROME_PATH môže určiť existujúci prehliadač. Používajú sa syntetické dáta bez zápisu do produkcie.

Obmedzenia a ďalšie smerovanie: [mobilný plán](docs/mobile-roadmap.md).
