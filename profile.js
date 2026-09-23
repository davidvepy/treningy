function renderProfile(){
  const content=`<header class="page-title"><h1>Profil</h1></header>
    <div class="profile-card"><div><span>Prihlásený účet</span><b>${h(state.user.email||'Dávid')}</b></div><button id="logout">Odhlásiť</button></div>
    <div class="section-bar"><h2>AKO TRÉNOVAŤ</h2></div>
    <div class="help-list">
      <details><summary>Ako fungujú supersety</summary><p>Dva cviky ideš po sebe bez plnej pauzy. Pauzu odpočítavaj až po druhom cviku páru.</p></details>
      <details><summary>Keď máš len 35 minút</summary><p>Nechaj hlavné pracovné cviky a skráť doplnkový objem. Rozcvičku a technicky náročný prvý cvik nevyhadzuj.</p></details>
      <details><summary>Ako voliť váhu</summary><p>Vyber záťaž, s ktorou spravíš cieľový rozsah opakovaní čistou technikou bez bolestivej kompenzácie.</p></details>
      <details><summary>Kedy pridať váhu</summary><p>Váhu pridaj vtedy, keď ti podľa RIR, techniky a výkonu dáva zmysel. Zmenu urob priamo počas tréningu alebo v editore plánu; aplikácia si poslednú pracovnú váhu zapamätá.</p></details>
      <details><summary>Týždenný objem</summary><p>Tonáž a počet sérií sleduj ako trend. Nie sú samy osebe skóre kvality tréningu.</p></details>
    </div>
    <div class="app-info"><span>Tréning v${APP_VERSION}</span><p>Dáta sú uložené v Supabase. Staré workout_logs zostávajú zachované a používajú sa v histórii a progrese.</p></div>`;
  app.innerHTML=shell(content,'profile');bindNav();document.getElementById('logout').onclick=()=>supabase.auth.signOut();
}
