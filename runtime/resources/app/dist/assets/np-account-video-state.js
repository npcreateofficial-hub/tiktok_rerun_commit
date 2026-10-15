export function subscribeAccountVideoState(setAccounts) {
  function sync(event) {
    if (event.key !== 'rerun.accounts' || !event.newValue) return;
    let saved;
    try { saved = JSON.parse(event.newValue); } catch { return; }
    if (!Array.isArray(saved)) return;
    const byId = new Map(saved.filter(item => item && typeof item.id === 'string').map(item => [item.id, item]));
    setAccounts(accounts => {
      let changed = false;
      const next = accounts.map(account => {
        const incoming = byId.get(account.id);
        if (!Array.isArray(incoming?.videoList)) return account;
        const videoList = incoming.videoList.filter(video => video && typeof video.path === 'string' && video.path);
        const streaming = ['starting', 'live', 'stopping'].includes(account.status?.state);
        const step = !videoList.length && account.step === 3 ? 2 : account.step;
        const maxStep = streaming ? account.maxStep : videoList.length
          ? Math.max(account.maxStep, 3) : Math.min(account.maxStep, 2);
        if (step === account.step && maxStep === account.maxStep &&
            JSON.stringify(videoList) === JSON.stringify(account.videoList)) return account;
        changed = true;
        // The picker owns video selection; runtime status and overlays stay in React.
        return { ...account, videoList, step, maxStep };
      });
      return changed ? next : accounts;
    });
  }
  window.addEventListener('storage', sync);
  sync({ key: 'rerun.accounts', newValue: localStorage.getItem('rerun.accounts') });
  return () => window.removeEventListener('storage', sync);
}
