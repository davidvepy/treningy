Promise.resolve().then(init).catch(err=>{console.error(err);window.__showBootError(err?.message||String(err));});
