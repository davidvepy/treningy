__supabaseReady.then(init).catch(err => { console.error(err); document.getElementById('app').innerHTML = '<div class="loading"><div>Nepodarilo sa načítať aplikáciu.</div></div>'; });
