(() => {
  const DEFAULT_SCHEDULE = { enabled: false, liveHours: 0, liveMinutes: 0, restMinutes: 0, videoQueueItems: [], videoQueuePaths: [] };
  const ADS_MANAGER_ENABLED = false;
  const REACT_DOM_PATCHES_ENABLED = true;
  const SIDEBAR_SECTION_KEY = 'np.sidebar.currentSection';
  const SIDEBAR_SECTIONS = ['แดชบอร์ด', 'บัญชีไลฟ์', 'แพ็กเกจ', 'คลังวิดีโอ', 'สรุปไลฟ์ย้อนหลัง'];

  function addStyle() {
    if (document.getElementById('np-live-patch-style')) return;
    const style = document.createElement('style');
    style.id = 'np-live-patch-style';
    style.textContent = `
      :root{--np-ui-font:"Noto Sans Thai","Segoe UI",Inter,ui-sans-serif,system-ui,sans-serif;--np-surface:#101827;--np-surface-2:#0b1220;--np-surface-3:#151f31;--np-line:rgba(126,164,218,.22);--np-line-strong:rgba(126,164,218,.36);--np-ink:#f5f8ff;--np-muted:#b6c4d9;--np-soft:#8fa1ba;--np-blue:#2b8bff;--np-blue-2:#126ce0;--np-gold:#f1b52f}
      label[for="license-key"],.license-field:has(#license-key){display:none!important}
      body,.app-shell,button,input,textarea,select{font-family:var(--np-ui-font)!important;letter-spacing:0!important;text-rendering:geometricPrecision!important}
      body{font-size:13px!important;color:var(--np-ink)!important}
      .main-area{background:radial-gradient(900px 520px at 80% 4%,rgba(43,139,255,.06),transparent 58%),linear-gradient(180deg,#080d16 0%,#060911 100%)!important}
      .topbar{height:68px!important;padding:0 34px!important;background:rgba(9,15,25,.92)!important;border-bottom:1px solid var(--np-line)!important}
      .topbar small{font-size:9.5px!important;color:#91a6c0!important;font-weight:800!important;text-transform:none!important}
      .topbar strong{font-size:12.5px!important;color:#fff!important;font-weight:900!important;line-height:1.25!important}
      .workspace-chip,.plan-chip{padding:8px 0!important}
      .np-topbar-user{display:flex!important;align-items:center!important;gap:9px!important;min-height:38px!important;max-width:260px!important;padding:7px 13px!important;border:1px solid rgba(43,139,255,.34)!important;border-radius:12px!important;background:linear-gradient(135deg,rgba(16,28,45,.92),rgba(7,14,25,.92))!important;color:#eef6ff!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important}
      .np-topbar-user svg{width:17px!important;height:17px!important;flex:0 0 auto!important;color:#4aa3ff!important}
      .np-topbar-user span{display:grid!important;min-width:0!important;line-height:1.1!important}
      .np-topbar-user small{font-size:9px!important;color:#8fb8ff!important;font-weight:850!important}
      .np-topbar-user strong{font-size:12.5px!important;color:#fff!important;font-weight:950!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .engine-pill{min-height:34px!important;padding:8px 14px!important;border-color:var(--np-line)!important;background:rgba(18,28,44,.78)!important;color:#d9e7fb!important;font-size:12px!important;font-weight:900!important}
      .np-live-reset-top{position:fixed!important;top:17px!important;right:188px!important;z-index:80!important;min-height:38px!important;padding:9px 14px!important;border-radius:10px!important;border:1px solid rgba(126,164,218,.32)!important;background:rgba(16,28,45,.9)!important;color:#dce8f8!important;box-shadow:none!important}
      .np-live-reset-top:hover{border-color:rgba(245,158,11,.58)!important;background:rgba(245,158,11,.12)!important;color:#fff!important}
      .sidebar{background:linear-gradient(180deg,rgba(14,23,38,.98),rgba(8,13,22,.98))!important}
      .sidebar button{min-height:44px!important;border-radius:12px!important;padding:11px 13px!important;font-size:14px!important;font-weight:850!important;color:#b8c7dc!important}
      .sidebar button:hover:not(.active){background:rgba(148,178,224,.08)!important;color:#eef6ff!important}
      .sidebar button.active{background:linear-gradient(135deg,#3195ff,#176de2)!important;color:#fff!important;box-shadow:0 14px 30px rgba(43,139,255,.34)!important}
      .sidebar button.np-package-locked{opacity:.68!important;filter:saturate(.7) brightness(.86)!important;background:rgba(10,20,35,.82)!important;border-color:rgba(88,132,190,.28)!important;color:#9dafc7!important;box-shadow:none!important;cursor:not-allowed!important}
      .sidebar button.np-package-locked svg{opacity:.78!important}
      .sidebar button.np-package-locked::after{opacity:.58!important}
      .sidebar button.np-package-locked:hover{background:rgba(12,24,41,.88)!important;color:#aabbd2!important;border-color:rgba(88,132,190,.34)!important;transform:none!important}
      .brand strong{font-size:18px!important;font-weight:950!important}
      .brand small{font-size:12px!important;color:#9eb0c7!important}
      .page-intro{padding:30px 40px 22px!important;border-bottom:1px solid var(--np-line)!important}
      .page-intro h1{font-size:27px!important;line-height:1.18!important;font-weight:950!important;letter-spacing:0!important;color:#fff!important}
      .page-intro p{display:none!important}
      .page-intro .eyebrow{display:none!important}
      .page-intro>div{display:grid!important;gap:0!important}
      .eyebrow{font-size:12px!important;font-weight:850!important;letter-spacing:0!important;color:#8fb8ff!important;margin-bottom:7px!important}
      .wizard-area{padding:36px 40px 118px!important}
      .stepper{max-width:1120px!important;margin-bottom:34px!important}
      .step-number{width:34px!important;height:34px!important;font-size:13px!important;font-weight:950!important;border:1px solid var(--np-line-strong)!important;background:#1b2638!important}
      .step-label{font-size:11px!important;font-weight:850!important;color:#aebdd3!important}
      .step.active .step-number{background:linear-gradient(135deg,#3aa0ff,#156ee6)!important;box-shadow:0 12px 28px rgba(43,139,255,.32)!important}
      .step.active .step-label{color:#fff!important}
      .step-line{height:2px!important;margin-top:18px!important;background:rgba(126,164,218,.22)!important}
      .step-content{max-width:1120px!important}
      .card,.dash-panel,.stat-card,.license-card,.admin-panel,.ready-hero,.import-panel{background:linear-gradient(180deg,rgba(16,25,40,.96),rgba(9,15,26,.98))!important;border:1px solid var(--np-line)!important;border-radius:17px!important;box-shadow:0 18px 44px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.055)!important}
      .card{padding:26px!important}
      .card-heading{margin-bottom:22px!important;gap:18px!important}
      .card-heading h2{font-size:21px!important;line-height:1.25!important;font-weight:950!important;letter-spacing:0!important;color:#fff!important}
      .card-heading p{font-size:12.5px!important;line-height:1.58!important;color:var(--np-muted)!important}
      .field-label,.np-live-number span,.np-live-queue-cell span,label{font-size:12px!important;font-weight:850!important;color:#dce8f8!important}
      .text-input,input[type="text"],input[type="number"],textarea,select{min-height:43px!important;border-radius:10px!important;background:#070d18!important;border:1px solid var(--np-line-strong)!important;color:#f6f9ff!important;font-size:13.5px!important;font-weight:750!important}
      textarea{line-height:1.6!important;padding:12px 14px!important}
      .text-input::placeholder,input::placeholder,textarea::placeholder{color:#8193ad!important;opacity:1!important}
      .text-input:focus,input:focus,textarea:focus,select:focus{border-color:rgba(43,139,255,.9)!important;box-shadow:0 0 0 3px rgba(43,139,255,.18)!important;outline:none!important}
      .primary-button,.tiktok-button,.outline-button,.soft-button,.ghost-button,.np-live-queue-pick{min-height:38px!important;border-radius:10px!important;font-size:12px!important;font-weight:900!important}
      .primary-button,.tiktok-button{border:1px solid rgba(100,174,255,.42)!important;background:linear-gradient(135deg,#3195ff,#176de2)!important;color:#fff!important;box-shadow:0 14px 30px rgba(43,139,255,.32)!important}
      .live-panel .primary-button{border-color:rgba(52,211,153,.5)!important;background:linear-gradient(135deg,#34d399,#16a34a)!important;color:#052e1a!important;box-shadow:0 14px 30px rgba(34,197,94,.28)!important}
      .primary-button:hover,.tiktok-button:hover{filter:brightness(1.07)!important;transform:translateY(-1px)!important}
      .primary-button.np-live-next-unlocked{opacity:1!important;filter:none!important;pointer-events:auto!important;cursor:pointer!important}
      .ghost-button,.outline-button,.soft-button,.np-live-queue-pick{padding:9px 14px!important;border:1px solid rgba(92,147,220,.36)!important;background:rgba(16,28,45,.88)!important;color:#dcecff!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)!important}
      .ghost-button:hover,.outline-button:hover,.soft-button:hover,.np-live-queue-pick:hover{border-color:rgba(43,139,255,.72)!important;background:rgba(43,139,255,.18)!important;color:#fff!important}
      .icon-button{background:rgba(18,28,44,.86)!important;border:1px solid rgba(126,164,218,.2)!important;color:#c9d8ec!important}
      .icon-button:hover{background:rgba(43,139,255,.16)!important;color:#fff!important;border-color:rgba(43,139,255,.45)!important}
      .option-row,.connected-panel,.privacy-note,.warning-note,.clip-info,.video-list-item,.camera-panel,.overlay-item,.quality-box{background:rgba(18,28,44,.86)!important;border:1px solid rgba(126,164,218,.2)!important;border-radius:13px!important}
      .status-pill{font-size:12px!important;font-weight:950!important;padding:9px 13px!important;background:rgba(31,43,62,.9)!important;border-color:var(--np-line)!important;color:#d9e7fb!important}
      .toggle{width:46px!important;height:26px!important;padding:3px!important;background:#263246!important}
      .toggle span{width:20px!important;height:20px!important;background:#07101d!important}
      .toggle.on{background:linear-gradient(135deg,#3195ff,#176de2)!important}
      .toggle.on span{margin-left:20px!important}
      .accounts-bar{padding-top:0!important}
      body.np-topup-active .accounts-bar{display:none!important}
      .accounts-bar .account-chip,.accounts-bar .account-add{height:58px!important;min-width:158px!important;border-radius:13px!important;background:rgba(16,28,45,.92)!important;border:1px solid var(--np-line)!important;color:#edf5ff!important}
      .accounts-bar .account-chip{position:relative!important;overflow:hidden!important;isolation:isolate!important}
      .accounts-bar .account-chip::before{content:"";display:none;position:absolute;inset:0 auto 0 0;width:4px;background:#f59e0b;opacity:1;z-index:0}
      .accounts-bar .account-chip .account-chip-main,.accounts-bar .account-chip .account-chip-remove{position:relative;z-index:1}
      .accounts-bar .account-chip .account-dot{background:#314158!important;box-shadow:none!important}
      .accounts-bar .account-chip.active{border-color:#f59e0b!important;background:linear-gradient(135deg,rgba(245,158,11,.22),rgba(10,17,29,.96))!important;box-shadow:0 0 0 1px rgba(245,158,11,.72),0 16px 38px rgba(245,158,11,.22)!important}
      .accounts-bar .account-chip.active::before{display:block}
      .accounts-bar .account-chip.active::after{display:none!important;content:none!important}
      .accounts-bar .account-chip.active .account-dot{background:#f59e0b!important;box-shadow:0 0 0 4px rgba(245,158,11,.18)!important}
      .accounts-bar .account-chip.active strong{color:#fff!important;text-shadow:none!important}
      .accounts-bar .account-chip.active small{color:#ffd99a!important}
      .accounts-bar .account-chip.np-account-control-target{transform:translateY(-1px)}
      .accounts-bar .account-chip strong,.accounts-bar .account-add strong{font-size:12px!important;font-weight:900!important;color:#fff!important}
      .accounts-bar .account-chip small,.accounts-bar .account-add small{font-size:9.5px!important;color:#aebbd0!important;font-weight:800!important}
      .np-live-video-card-patched>.card-heading h2{font-size:22px!important}
      .np-live-extra-card{margin-top:0}
      .np-live-video-card-patched{display:grid!important;grid-template-columns:240px minmax(0,1fr);grid-template-areas:"head head" "main queue" "schedule schedule";gap:18px;align-items:start}
      .np-live-video-card-patched>.card-heading{grid-area:head!important;margin-bottom:4px}
      .np-live-video-card-patched>.video-list,.np-live-video-card-patched>.dropzone{display:none!important}
      .np-live-main-video{grid-area:main!important;display:grid;gap:10px;align-content:start}
      .np-live-main-video .np-live-main-frame{min-height:360px;aspect-ratio:9/16;border:1px solid rgba(113,156,217,.24);border-radius:14px;background:rgba(13,22,35,.72);display:grid;place-items:center;padding:10px;text-align:center;overflow:hidden;cursor:pointer}
      .np-live-main-video .np-live-main-frame:not(.is-empty){min-height:420px}
      .np-live-main-video .np-live-main-frame.is-empty{border:1px dashed rgba(96,165,250,.58);background:linear-gradient(180deg,rgba(17,30,48,.88),rgba(7,14,26,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 16px 42px rgba(0,0,0,.16)}
      .np-live-main-video .np-live-main-inner{position:relative;width:100%;height:100%;display:grid}
      .np-live-main-video .np-live-main-delete{position:absolute;right:8px;top:8px;z-index:40;width:30px;height:30px;border:1px solid rgba(248,113,113,.55);border-radius:9px;background:rgba(55,16,22,.88);color:#fecaca;font-weight:900;cursor:pointer;pointer-events:auto!important}
      .np-live-main-video .np-live-main-delete:hover{background:rgba(127,29,29,.95)}
      .np-live-main-video video{width:100%;height:100%;min-height:398px;border-radius:12px;object-fit:contain;background:#020712}
      .np-live-main-video strong{display:block;color:#f1f6ff;font-size:13px;line-height:1.35;word-break:break-word}
      .np-live-main-video small{display:block;color:#91a6c0;font-size:11px;line-height:1.4;margin-top:4px}
      .np-live-main-video .np-live-queue-pick{width:100%;justify-content:center;color:#dff0ff!important;background:rgba(43,139,255,.16)!important}
      .np-live-main-empty{display:grid;justify-items:center;align-content:center;gap:12px;padding:22px;min-height:100%}
      .np-live-main-empty-icon{width:64px;height:64px;border-radius:20px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(43,139,255,.32),rgba(20,184,166,.15));border:1px solid rgba(125,190,255,.45);box-shadow:0 18px 40px rgba(43,139,255,.18)}
      .np-live-main-empty-icon svg{width:32px;height:32px;fill:none;stroke:#93cfff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .np-live-main-empty-title{font-size:14px!important;color:#f8fbff!important;margin-top:2px}
      .np-live-main-empty-help{max-width:170px;color:#aabbd4!important;font-size:11px!important;line-height:1.55!important}
      .np-live-main-empty-pill{margin-top:2px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgba(96,165,250,.32);background:rgba(43,139,255,.12);color:#bfe1ff;font-size:10px;font-weight:900;padding:6px 10px}
      .np-live-video-card-patched>.dropzone{grid-column:1;width:100%;min-height:360px;aspect-ratio:9/16;padding:14px;text-align:center}
      .np-live-video-card-patched>.dropzone.has-file{min-height:360px;display:grid;place-items:center;padding:10px}
      .np-live-video-card-patched>.dropzone video{width:100%;height:315px;border-radius:12px;object-fit:cover;margin:0}
      .np-live-video-card-patched>.dropzone .file-copy{margin:8px 0 0;align-items:center;text-align:center}
      .np-live-video-card-patched>.dropzone .file-copy strong,.np-live-video-card-patched>.dropzone .file-copy small{max-width:210px}
      .np-live-video-card-patched>.option-row{display:none!important}
      .np-live-video-card-patched .video-list-item{padding:8px}
      .np-live-video-card-patched .video-list-item video{width:58px;height:82px}
      .np-live-video-card-patched .video-list-item .file-copy strong{max-width:120px}
      .np-live-video-card-patched .video-list-item .file-copy small{display:none}
      .np-live-video-card-patched>.np-live-video-queue{grid-area:queue!important;min-width:0;align-self:start}
      .np-live-video-card-patched>.np-live-video-queue.is-empty{grid-area:queue!important;align-self:start;padding:14px!important}
      .np-live-video-queue .card-heading{margin-bottom:10px!important;align-items:center!important}
      .np-live-video-queue.is-empty .card-heading{margin-bottom:0!important}
      .np-live-video-queue .card-heading h2{font-size:17px!important;line-height:1.25!important}
      .np-live-video-queue .card-heading p,.np-live-video-queue .card-heading .eyebrow{display:none!important}
      .np-live-queue-count{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:6px 10px;border-radius:999px;background:rgba(241,181,47,.14);border:1px solid rgba(241,181,47,.32);color:#ffd166;font-size:11px;font-weight:900;white-space:nowrap}
      .np-live-queue-head-actions{display:flex;gap:8px;align-items:center}
      .np-live-video-card-patched>.np-live-schedule-card{grid-area:schedule!important;margin-top:0;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(15,27,44,.82),rgba(9,16,28,.92));display:grid;grid-template-columns:175px minmax(0,1fr) 150px;gap:14px;align-items:center}
      .np-live-video-card-patched>.np-live-schedule-card .card-heading{margin:0;display:grid!important;grid-template-columns:1fr!important;align-items:start!important;justify-content:start!important;gap:8px;min-width:0}
      .np-live-video-card-patched>.np-live-schedule-card .card-heading h2{font-size:14px!important;line-height:1.25;white-space:nowrap}
      .np-live-video-card-patched>.np-live-schedule-card .card-heading .eyebrow{margin-bottom:4px}
      .np-live-video-card-patched>.np-live-schedule-card .toggle{margin:0;justify-self:center}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-schedule-grid{grid-template-columns:1fr .58fr 1.05fr;gap:9px;margin-top:0}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-number{gap:5px}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-number span{font-size:10px!important;color:#cbd8ea!important}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-number input{height:34px!important;min-height:34px!important;font-size:12.5px!important;border-radius:9px!important}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-status{display:grid;grid-template-columns:1fr;gap:5px;margin-top:0;padding:0;min-height:0;border:0;background:transparent}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-status span{font-size:10px!important;color:#cbd8ea!important;font-weight:850!important}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-status strong{display:flex;align-items:center;height:34px;min-height:34px;padding:0 12px;border-radius:9px;background:rgba(7,13,24,.58);border:1px solid rgba(126,164,218,.28);font-size:11px!important;line-height:1.3;color:#f4f8ff!important}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-muted{font-size:10px}
      .np-live-video-card-patched>.np-live-schedule-card .np-live-actions{display:none!important}
      .np-live-extra-card .np-live-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end}
      .np-live-extra-card .np-live-result{margin-top:12px}
      .np-live-extra-card .np-live-schedule-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:18px}
      .np-live-extra-card .np-live-number{display:grid;gap:7px}
      .np-live-extra-card .np-live-number span{color:#dce9fb;font-size:13px;font-weight:800}
      .np-live-extra-card .np-live-number input{font-size:16px}
      .np-live-extra-card .np-live-queue-grid{display:block;margin-top:16px}
      .np-live-video-queue.is-empty .np-live-queue-grid{display:none!important}
      .np-live-extra-card .np-live-queue-table{display:grid;gap:9px}
      .np-live-extra-card .np-live-queue-item{display:grid;grid-template-columns:68px minmax(130px,1fr) 84px 74px 104px auto;gap:9px;align-items:center;min-height:88px;padding:10px;border:1px solid rgba(113,156,217,.24);border-radius:14px;background:rgba(7,15,28,.7)}
      .np-live-extra-card .np-live-queue-item.empty{border-style:dashed;background:rgba(13,22,35,.5)}
      .np-live-extra-card .np-live-queue-item video{width:58px;height:78px;border-radius:10px;background:#020712;object-fit:cover}
      .np-live-extra-card .np-live-queue-item strong{display:block;color:#f1f6ff;font-size:13px;line-height:1.35}
      .np-live-extra-card .np-live-queue-item small{color:#91a6c0}
      .np-live-extra-card .np-live-queue-cell{display:grid;gap:6px}
      .np-live-extra-card .np-live-queue-cell span{color:#91a6c0;font-size:10px;font-weight:800}
      .np-live-extra-card .np-live-queue-cell input{height:38px;min-width:0}
      .np-live-extra-card .np-live-queue-actions{display:flex;gap:6px}
      .np-live-extra-card .np-live-queue-pick{border:1px solid rgba(54,140,255,.5);background:rgba(43,139,255,.16);color:#dff0ff;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:800;cursor:pointer}
      .np-live-extra-card .np-live-queue-pick:hover{background:rgba(43,139,255,.28)}
      .np-live-extra-card .np-live-queue-add-chip{width:58px;height:44px;border:1px solid rgba(245,158,11,.34);border-radius:10px;background:rgba(245,158,11,.12);color:#ffd166;font-size:12px;font-weight:900;cursor:pointer}
      .np-live-extra-card .np-live-queue-add-chip:hover{border-color:rgba(245,158,11,.72);background:rgba(245,158,11,.2);color:#fff}
      .np-live-extra-card .np-live-queue-note{margin-top:10px;color:#91a6c0;font-size:11px;line-height:1.45}
      .np-live-extra-card .np-live-status{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding:13px 15px;border:1px solid rgba(113,156,217,.22);border-radius:14px;background:rgba(5,12,22,.54);color:#b8c9e2}
      .np-live-extra-card .np-live-status strong{color:#dff0ff}
      .np-live-extra-card .np-live-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
      .np-live-extra-card .np-live-muted{color:#8fa3bf;font-size:12px;line-height:1.55}
      .np-live-extra-card .np-live-hidden{display:none!important}
      .np-live-picker-backdrop{position:fixed;inset:0;z-index:99997;display:grid;place-items:center;background:rgba(1,5,12,.72);backdrop-filter:blur(8px)}
      .np-live-picker{width:min(1120px,calc(100vw - 42px));max-height:min(820px,calc(100vh - 42px));overflow:hidden;padding:22px 22px 18px;border:1px solid rgba(255,255,255,.78);border-radius:18px;background:linear-gradient(140deg,rgba(7,18,34,.98),rgba(7,11,18,.98) 64%,rgba(54,35,5,.92));color:#f3f8ff;box-shadow:0 30px 100px rgba(0,0,0,.58)}
      .np-live-picker-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
      .np-live-picker-head h2{margin:0;color:#fff;font-size:24px;line-height:1.25}
      .np-live-picker-head p{margin:6px 0 0;color:#aebdd2;font-size:13px;line-height:1.45}
      .np-live-picker-head-actions{display:grid;justify-items:end;gap:10px;min-width:max-content}
      .np-live-picker-count{color:#f1b52f;font-size:13px;font-weight:950;white-space:nowrap;margin-top:20px}
      .np-live-picker-close{border:0;background:transparent;color:#d5dfef;font-size:13px;font-weight:850;cursor:pointer;padding:8px 0}
      .np-live-picker-list{max-height:min(660px,calc(100vh - 176px));overflow:auto;padding:0 6px 4px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(172px,184px));justify-content:start;gap:14px;scrollbar-width:thin;scrollbar-color:#1f75d6 rgba(148,178,224,.08)}
      .np-live-picker-list::-webkit-scrollbar{width:8px}.np-live-picker-list::-webkit-scrollbar-track{background:rgba(148,178,224,.08);border-radius:999px}.np-live-picker-list::-webkit-scrollbar-thumb{background:#1f75d6;border-radius:999px}
      .np-live-picker-card{position:relative;width:100%;text-align:left;cursor:pointer;padding:9px;border:1px solid rgba(255,255,255,.58);border-radius:14px;background:rgba(5,8,14,.78);color:#f3f8ff;display:grid;grid-template-rows:auto auto auto;gap:8px;box-shadow:inset 0 1px 0 rgba(255,255,255,.045)}
      .np-live-picker-card:hover,.np-live-picker-card.selected{border-color:#f1b52f;background:rgba(37,24,5,.76);box-shadow:0 14px 34px rgba(0,0,0,.28),0 0 0 1px rgba(241,181,47,.18)}
      .np-live-picker-preview{position:relative;width:100%;aspect-ratio:9/16;border-radius:11px;background:#020202;overflow:hidden;display:grid;place-items:center}
      .np-live-picker-preview video{width:100%;height:100%;object-fit:cover;background:#020202}
      .np-live-picker-ready{position:absolute;left:8px;top:8px;z-index:2;border-radius:999px;background:#f1b52f;color:#070707;font-size:9px;font-weight:950;padding:4px 8px;box-shadow:0 8px 20px rgba(0,0,0,.22)}
      .np-live-picker-title{border-radius:10px;background:rgba(8,12,20,.86);padding:9px;display:grid;gap:4px;min-width:0}
      .np-live-picker-title strong{color:#fff;font-size:13px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .np-live-picker-title small{color:#9ca8b9;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .np-live-picker-meta{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end}
      .np-live-picker-meta span{display:block;color:#aeb3bd;font-size:10px;font-weight:850;margin-bottom:3px}
      .np-live-picker-meta b{display:block;color:#fff;font-size:12px;line-height:1.25}
      .np-live-picker-meta div:nth-child(2){display:none}
      .np-live-picker-select{justify-self:end;width:22px;height:22px;border:1px solid rgba(255,255,255,.55);border-radius:999px;display:grid;place-items:center;color:transparent;font-size:13px;font-weight:950}
      .np-live-picker-card.selected .np-live-picker-select{background:#f1b52f;border-color:#f1b52f;color:#080808}
      .np-live-picker-select-button{height:36px;border:0;border-radius:9px;background:#f1b52f;color:#080808;font-size:13px;font-weight:950;cursor:pointer;grid-column:1/-1}
      .np-live-picker-select-button:hover{filter:brightness(1.06)}
      .accounts-bar{width:min(1180px,calc(100% - 80px))!important;margin:0 auto 34px!important;display:flex!important;justify-content:flex-start!important;gap:10px!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;padding-bottom:4px!important;scrollbar-width:thin;scrollbar-color:rgba(83,148,255,.5) rgba(148,178,224,.08)}
      .accounts-bar::-webkit-scrollbar{height:6px}
      .accounts-bar::-webkit-scrollbar-track{background:rgba(148,178,224,.08);border-radius:999px}
      .accounts-bar::-webkit-scrollbar-thumb{background:rgba(83,148,255,.5);border-radius:999px}
      .accounts-bar .account-chip,.accounts-bar .account-add{flex:0 0 auto!important}
      .np-library-pending-card{position:relative;width:150px;min-height:455px;border:1px solid rgba(255,190,24,.85);border-radius:10px;overflow:hidden;background:linear-gradient(180deg,rgba(18,24,33,.98),rgba(10,12,16,.98));box-shadow:0 18px 48px rgba(0,0,0,.34);display:flex;flex-direction:column}
      .np-library-pending-card .np-library-pending-preview{height:285px;flex:0 0 285px;background:#050b14;position:relative;display:grid;place-items:center;overflow:hidden}
      .np-library-pending-card video{width:100%;height:100%;object-fit:cover}
      .np-library-pending-card .np-library-uploading{position:absolute;left:10px;top:10px;padding:5px 9px;border-radius:999px;background:#f3b62f;color:#111;font-size:11px;font-weight:900}
      .np-library-pending-card .np-library-progress{display:grid;gap:6px}
      .np-library-pending-card .np-library-progress-top{display:flex;justify-content:space-between;gap:8px;color:#f8fbff;font-size:11px;font-weight:900}
      .np-library-pending-card .np-library-progress-bar{height:7px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden}
      .np-library-pending-card .np-library-progress-bar i{display:block;height:100%;width:0%;border-radius:999px;background:linear-gradient(90deg,#2b8bff,#f3b62f);transition:width .2s ease}
      .np-library-pending-card .np-library-progress-detail{display:none!important}
      .np-library-pending-card .np-library-card-body{padding:10px 10px 12px;display:grid;gap:8px;flex:1 1 auto}
      .np-library-pending-card strong{color:#f8fbff;font-size:13px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .np-library-pending-card small{color:#aebdd2;font-size:10px;line-height:1.35}
      .np-library-upload-backdrop{position:fixed;inset:0;z-index:99998;display:grid;place-items:center;padding:24px;background:rgba(1,5,12,.76);backdrop-filter:blur(10px)}
      .np-library-upload-modal{width:min(820px,calc(100vw - 28px));border:1px solid rgba(255,190,24,.72);border-radius:18px;background:linear-gradient(140deg,#071120,#070b12 62%,rgba(49,31,4,.9));box-shadow:0 30px 110px rgba(0,0,0,.62);color:#f4f8ff;padding:24px}
      .np-library-upload-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:18px}
      .np-library-upload-head span{display:block;color:#8fb8ff;font-size:12px;font-weight:850;letter-spacing:0;text-transform:none;margin-bottom:8px}
      .np-library-upload-head h2{margin:0;color:#f4f8ff;font-size:24px;line-height:1.2}
      .np-library-upload-head p{margin:8px 0 0;color:#aebdd2;font-size:12px;line-height:1.55}
      .np-library-upload-close{width:42px;height:42px;border:1px solid rgba(255,207,69,.7);border-radius:999px;background:rgba(7,15,28,.64);color:#ffcf45;font-size:24px;line-height:1;cursor:pointer}
      .np-library-upload-body{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:28px;align-items:stretch}
      .np-library-upload-drop{position:relative;min-height:430px;border:1px dashed rgba(43,139,255,.72);border-radius:14px;background:linear-gradient(180deg,rgba(6,17,31,.95),rgba(3,9,17,.92));display:grid;place-items:center;text-align:center;padding:18px;cursor:pointer;overflow:hidden}
      .np-library-upload-drop video{width:100%;height:390px;object-fit:cover;border-radius:12px;background:#020712}
      .np-library-clear-video{position:absolute;top:12px;right:12px;z-index:5;width:32px;height:32px;border:1px solid rgba(255,255,255,.55);border-radius:10px;background:rgba(8,12,20,.76);color:#fff;font-size:22px;line-height:1;display:grid;place-items:center;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.34)}
      .np-library-clear-video:hover{border-color:#ffcf45;color:#ffcf45;background:rgba(20,16,9,.9)}
      .np-library-upload-empty{display:grid;gap:10px;justify-items:center;color:#b8c9e2;font-weight:800}
      .np-library-upload-empty b{font-size:38px;color:#6ab8ff;font-weight:300;line-height:1}
      .np-library-upload-form{display:grid;align-content:center;gap:14px;min-width:0}
      .np-library-upload-form label{display:grid;gap:8px;color:#dce9fb;font-size:12px;font-weight:900}
      .np-library-upload-form input{height:46px;border:1px solid rgba(113,156,217,.35);border-radius:10px;background:#08101d;color:#f4f8ff;padding:0 14px;font:inherit;font-weight:800;outline:none}
      .np-library-upload-form input:focus{border-color:#2b8bff;box-shadow:0 0 0 3px rgba(43,139,255,.18)}
      .np-library-upload-meta{border:1px solid rgba(113,156,217,.25);border-radius:12px;background:rgba(10,18,31,.72);padding:14px;display:grid;gap:8px;color:#aebdd2;font-size:12px}
      .np-library-upload-meta strong{display:block;color:#f4f8ff;font-size:13px;word-break:break-word}
      .np-library-upload-actions{display:grid;gap:10px;margin-top:4px}
      .np-library-upload-primary,.np-library-upload-secondary{height:46px;border-radius:10px;font:inherit;font-weight:900;cursor:pointer}
      .np-library-upload-primary{border:1px solid rgba(255,190,24,.82);background:#2b8bff;color:#fff}
      .np-library-upload-primary:disabled{opacity:.45;cursor:not-allowed}
      .np-library-upload-secondary{border:1px solid rgba(113,156,217,.35);background:rgba(13,22,35,.72);color:#dce9fb}
      .np-library-upload-note{font-size:11px;color:#aebdd2;text-align:center;line-height:1.45}
      .np-library-upload-modal{width:min(980px,calc(100vw - 36px))!important}
      .np-library-upload-body{grid-template-columns:minmax(260px,360px) minmax(360px,1fr)!important;align-items:center!important;gap:30px!important}
      .np-library-upload-drop{width:min(340px,100%)!important;height:min(62vh,560px)!important;min-height:0!important;aspect-ratio:9/16!important;padding:10px!important;margin:0 auto!important;display:grid!important;place-items:center!important;overflow:hidden!important}
      .np-library-upload-drop video{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:center center!important;border-radius:12px!important;background:#020712!important}
      .np-library-upload-drop .np-library-upload-empty{width:100%;height:100%;display:grid;place-content:center;gap:10px}
      .library-page{width:min(calc(100% - 72px),1560px)!important;margin:0 auto!important;padding:26px 0 80px!important}
      .library-page .page-intro.library-hero,.library-page .np-storage-intro{display:none!important}
      .library-page .page-intro.library-hero{justify-content:flex-end!important;padding:0!important;margin:0!important;border-bottom:0!important;align-items:center!important}
      .library-page .page-intro.library-hero>div{display:none!important}
      .library-page .page-intro.library-hero .primary-button{display:none!important}
      .np-library-toolbar{display:grid;grid-template-columns:minmax(260px,330px) 1fr auto auto;gap:14px;align-items:center;margin:10px 0 24px}
      .np-library-search{height:42px;border:1px solid rgba(245,158,11,.5);border-radius:10px;background:#050607;color:#f8fbff;padding:0 15px;font:inherit;font-size:13px;font-weight:800;outline:none}
      .np-library-search::placeholder{color:#6f7785}
      .np-library-search:focus{border-color:#fbbf24;box-shadow:0 0 0 3px rgba(251,191,36,.12)}
      .np-library-toolbar-spacer{min-width:0}
      .np-library-upload-main{min-height:42px;padding:0 22px;border:1px solid rgba(43,139,255,.9)!important;border-radius:9px!important;background:linear-gradient(180deg,#1287ff,#0066d9)!important;color:#fff!important;font-size:13px!important;font-weight:950!important;box-shadow:0 14px 32px rgba(18,135,255,.28)!important;white-space:nowrap}
      .np-library-sort-label{display:flex;align-items:center;gap:10px;color:#dce8f8;font-size:12px;font-weight:850;white-space:nowrap}
      .np-library-sort{height:42px;border:1px solid rgba(245,158,11,.46);border-radius:9px;background:#050607;color:#fff;padding:0 34px 0 12px;font:inherit;font-size:12px;font-weight:850;outline:none}
      .np-library-sort-icon{color:#fbbf24;font-size:21px;font-weight:950}
      .library-page .library-grid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(150px,150px))!important;gap:18px!important;justify-content:start!important;align-items:start!important;padding:0 0 40px!important}
      .library-page .library-card,.library-page .video-card{position:relative!important;width:150px!important;height:455px!important;padding:0!important;overflow:hidden!important;border-radius:10px!important;background:#0a0a09!important;border:1px solid rgba(255,255,255,.7)!important;box-shadow:0 18px 36px rgba(0,0,0,.48)!important;display:flex!important;flex-direction:column!important}
      .library-page .library-card:hover,.library-page .video-card:hover{border-color:#f1b52f!important;background:#0a0a09!important}
      .library-page .library-thumb,.library-page .video-thumb{position:relative!important;width:100%!important;height:285px!important;flex:0 0 285px!important;padding:0!important;margin:0!important;border:0!important;border-radius:9px 9px 0 0!important;background:#050505!important;overflow:hidden!important}
      .library-page .library-thumb video,.library-page .library-thumb img,.library-page .video-thumb video,.library-page .video-thumb img{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:cover!important;object-position:center!important;border-radius:9px 9px 0 0!important;background:#050505!important;display:block!important;margin:0!important;padding:0!important}
      .library-page .library-thumb:before,.library-page .video-thumb:before{content:"MP4";position:absolute;left:10px;top:10px;z-index:2;height:18px;padding:0 11px;border-radius:999px;background:#f1b52f;color:#030303;font-size:10px;font-weight:950;line-height:18px;letter-spacing:0}
      .library-page .library-thumb:after,.library-page .video-thumb:after{content:"";position:absolute;left:50%;top:50%;z-index:2;width:48px;height:48px;border-radius:999px;background:#f1b52f;transform:translate(-50%,-50%);box-shadow:0 0 0 10px rgba(0,0,0,.42)}
      .library-page .np-library-play-triangle{position:absolute;left:50%;top:50%;z-index:3;width:0;height:0;border-top:9px solid transparent;border-bottom:9px solid transparent;border-left:14px solid #050505;transform:translate(-38%,-50%);pointer-events:none}
      .library-page .library-card.np-library-playing .library-thumb:after,.library-page .library-card.np-library-playing .np-library-play-triangle{display:none!important}
      .library-page .library-info,.library-page .video-info{padding:10px 10px 12px!important;background:#0a0a09!important;display:grid!important;gap:8px!important;flex:1 1 auto!important;border-top:1px solid rgba(241,181,47,.34)!important}
      .library-page .library-info strong,.library-page .video-info strong{padding:0!important;color:#fff!important;font-size:13px!important;font-weight:900!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .library-page .library-info small,.library-page .video-info small{display:none!important}
      .library-page .np-library-kebab{position:absolute;right:12px;top:300px;color:#777;font-size:20px;line-height:1;letter-spacing:1px}
      .library-page .np-library-meta-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:7px!important}
      .library-page .np-library-meta-box{min-height:48px!important;border-radius:7px!important;background:#050505!important;color:#fff!important;padding:7px 8px!important;display:grid!important;align-content:center!important;gap:3px!important}
      .library-page .np-library-meta-box span{display:block!important;color:#8f8f8f!important;font-size:9px!important;font-weight:800!important}
      .library-page .np-library-meta-box b{display:block!important;color:#fff!important;font-size:10px!important;line-height:1.25!important;word-break:break-word!important}
      .library-page .np-library-play-button{height:34px!important;min-height:34px!important;border:0!important;border-radius:7px!important;background:#f1b52f!important;color:#080808!important;font-size:12px!important;font-weight:950!important;display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;cursor:pointer!important;margin-top:auto!important;opacity:1!important}
      .library-page .np-library-play-button:disabled{background:#f1b52f!important;color:#080808!important;opacity:1!important;cursor:pointer!important}
      .library-page .np-library-play-button:hover{filter:brightness(1.06)}
      .library-page .library-card>.icon-button.danger,.library-page .video-card>.icon-button.danger{position:absolute!important;right:8px!important;top:8px!important;z-index:4!important;width:28px!important;height:28px!important;border-radius:8px!important;background:rgba(73,18,28,.9)!important;border:1px solid rgba(248,113,113,.6)!important;color:#ffc0c7!important}
      .np-library-confirm-backdrop{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:22px;background:rgba(0,4,10,.72);backdrop-filter:blur(10px)}
      .np-library-confirm-modal{width:min(420px,calc(100vw - 32px));border:1px solid rgba(241,181,47,.68);border-radius:16px;background:linear-gradient(145deg,#07111f,#080a10 64%,rgba(47,27,5,.92));box-shadow:0 28px 90px rgba(0,0,0,.62);color:#f8fbff;padding:22px;display:grid;gap:16px}
      .np-library-confirm-modal h3{margin:0;color:#fff;font-size:20px;line-height:1.25;font-weight:950}
      .np-library-confirm-modal p{margin:0;color:#b9c7da;font-size:13px;line-height:1.55}
      .np-library-confirm-name{border:1px solid rgba(113,156,217,.24);border-radius:10px;background:rgba(5,10,18,.7);padding:10px 12px;color:#fff;font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .np-library-confirm-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:2px}
      .np-library-confirm-actions button{height:40px;min-width:96px;border-radius:10px;font:inherit;font-size:13px;font-weight:950;cursor:pointer}
      .np-library-confirm-cancel{border:1px solid rgba(113,156,217,.42);background:rgba(9,18,32,.86);color:#dce9fb}
      .np-library-confirm-delete{border:1px solid rgba(248,113,113,.58);background:#8d1f2d;color:#fff}
      .np-library-confirm-cancel:hover{border-color:rgba(241,181,47,.72);color:#fff}
      .np-library-confirm-delete:hover{background:#b42335}
      .np-library-pending-card{position:relative!important;width:150px!important;height:455px!important;min-height:455px!important;padding:0!important;overflow:hidden!important;border:1px solid rgba(255,255,255,.7)!important;border-radius:10px!important;background:#0a0a09!important;box-shadow:0 18px 36px rgba(0,0,0,.48)!important;display:flex!important;flex-direction:column!important}
      .np-library-pending-card .np-library-pending-preview{width:100%!important;height:285px!important;flex:0 0 285px!important;border-radius:9px 9px 0 0!important;background:#050505!important}
      .np-library-pending-card .np-library-card-body{padding:10px 10px 12px!important;background:#0a0a09!important;display:grid!important;gap:8px!important;flex:1 1 auto!important;border-top:1px solid rgba(241,181,47,.34)!important}
      .np-register-link{width:100%;margin-top:10px;border:1px solid rgba(126,164,218,.32);border-radius:10px;background:rgba(16,28,45,.88);color:#dcecff;min-height:42px;font-weight:900;cursor:pointer}
      .np-register-link:hover{border-color:rgba(245,158,11,.7);background:rgba(245,158,11,.12);color:#fff}
      .np-register-backdrop{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:radial-gradient(900px 520px at 18% 18%,rgba(43,139,255,.22),transparent 58%),radial-gradient(720px 440px at 88% 72%,rgba(241,181,47,.18),transparent 58%),rgba(0,4,10,.8);backdrop-filter:blur(12px)}
      .np-register-modal{width:min(980px,calc(100vw - 32px));border:1px solid rgba(72,151,255,.62);border-radius:18px;background:linear-gradient(135deg,#071525,#060910 58%,#141006);box-shadow:0 34px 120px rgba(0,0,0,.68),inset 0 1px 0 rgba(255,255,255,.06);color:#f5f8ff;overflow:hidden;position:relative}
      .np-register-shell{display:grid;grid-template-columns:300px minmax(0,1fr);min-height:560px}
      .np-register-brand{padding:28px 26px;background:linear-gradient(180deg,rgba(11,31,55,.96),rgba(6,12,22,.98));border-right:1px solid rgba(113,156,217,.24);display:flex;flex-direction:column;gap:20px}
      .np-register-brand-top{display:flex;align-items:center;gap:14px}.np-register-brand-logo{width:66px;height:66px;border-radius:15px;background:#030812;border:1px solid rgba(96,165,250,.42);object-fit:contain;padding:7px;box-shadow:0 18px 46px rgba(43,139,255,.22)}
      .np-register-brand-name strong{display:block;font-size:22px;line-height:1.05;font-weight:950}.np-register-brand-name em{color:#39a4ff;font-style:normal}.np-register-brand-name small{display:block;margin-top:5px;color:#ffd35a;font-size:10px;font-weight:950;letter-spacing:1px}
      .np-register-brand h3{margin:10px 0 0;font-size:28px;line-height:1.18;font-weight:950;color:#fff}.np-register-brand p{margin:0;color:#b9c8de;font-size:13px;line-height:1.65}
      .np-register-benefits{display:grid;gap:10px;margin-top:auto}.np-register-benefit{display:flex;align-items:center;gap:10px;min-height:42px;padding:10px 12px;border-radius:12px;background:rgba(13,25,42,.82);border:1px solid rgba(113,156,217,.22);color:#e8f2ff;font-size:12px;font-weight:850}.np-register-benefit i{width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#f1b52f;color:#07101d;font-style:normal;font-size:12px;font-weight:950;flex:0 0 auto}
      .np-register-main{display:flex;flex-direction:column;min-width:0}.np-register-head{display:flex;justify-content:space-between;gap:18px;padding:26px 28px 18px;border-bottom:1px solid rgba(113,156,217,.22);background:linear-gradient(90deg,rgba(7,23,40,.92),rgba(8,13,22,.62))}
      .np-register-head h2{margin:0 0 6px;font-size:28px;line-height:1.15;font-weight:950}.np-register-head p{margin:0;color:#b7c8e1;font-size:13px;line-height:1.55}.np-register-close{width:40px;height:40px;border:1px solid rgba(113,156,217,.4);border-radius:10px;background:#071423;color:#dcecff;font-size:24px;cursor:pointer;flex:0 0 auto}.np-register-close:hover{border-color:rgba(241,181,47,.8);background:rgba(241,181,47,.12);color:#fff}
      .np-register-form{display:grid;grid-template-columns:1fr 1fr;gap:15px 14px;padding:24px 28px 26px}.np-register-form label{display:grid;gap:8px;color:#d8e6f8;font-size:12px;font-weight:900}.np-register-form input{height:46px;border-radius:11px;background:#061423;border:1px solid rgba(72,151,255,.46);color:#fff;padding:10px 13px;font:inherit;font-weight:850;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}.np-register-form input::placeholder{color:#6f83a0}.np-register-form input:focus{outline:none;border-color:#2b8bff;box-shadow:0 0 0 3px rgba(43,139,255,.18)}
      .np-register-form .full{grid-column:1 / -1}.np-register-submit{grid-column:1 / -1;height:48px;border:0;border-radius:12px;background:linear-gradient(135deg,#ffd25d,#f2a900);color:#05070c;font-size:14px;font-weight:950;cursor:pointer;box-shadow:0 18px 42px rgba(242,169,0,.24)}.np-register-submit:hover{filter:brightness(1.05);transform:translateY(-1px)}.np-register-error{grid-column:1 / -1;color:#ff9b9b;font-weight:850}.np-register-note{grid-column:1 / -1;color:#aebdd3;font-size:12px;line-height:1.55;margin:0;padding:12px 14px;border:1px solid rgba(113,156,217,.18);border-radius:12px;background:rgba(13,25,42,.58)}
      @media(max-width:980px){.np-library-toolbar{grid-template-columns:1fr 1fr}.np-library-search{grid-column:1/-1}.np-library-toolbar-spacer{display:none}}
      @media(max-width:780px){.np-library-upload-body{grid-template-columns:1fr}.np-library-upload-drop{min-height:320px}.np-library-upload-drop video{height:300px}.np-register-shell{grid-template-columns:1fr}.np-register-brand{display:none}.np-register-form{grid-template-columns:1fr}.np-register-modal{max-height:calc(100vh - 28px);overflow:auto}}
      @media(max-width:760px){
        .np-library-upload-backdrop{padding:10px!important;place-items:center!important;overflow:auto!important}
        .np-library-upload-modal{width:calc(100vw - 20px)!important;max-width:none!important;max-height:calc(100vh - 20px)!important;overflow:auto!important;padding:14px!important;border-radius:14px!important}
        .np-library-upload-head{gap:10px!important;margin-bottom:12px!important}
        .np-library-upload-head span{font-size:10px!important;margin-bottom:5px!important}
        .np-library-upload-head h2{font-size:20px!important;line-height:1.2!important}
        .np-library-upload-head p{margin-top:6px!important;font-size:11px!important;line-height:1.4!important}
        .np-library-upload-close{width:36px!important;height:36px!important;font-size:21px!important;flex:0 0 36px!important}
        .np-library-upload-body{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;align-items:stretch!important}
        .np-library-upload-drop{width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:9/12!important;padding:8px!important;margin:0!important}
        .np-library-upload-drop video{width:100%!important;height:100%!important;object-fit:contain!important}
        .np-library-upload-form{gap:10px!important}
        .np-library-upload-form input{height:40px!important}
        .np-library-upload-primary,.np-library-upload-secondary{height:40px!important}
        .library-page{width:100%!important;max-width:none!important;margin:0!important;padding:16px 10px 140px!important;overflow:visible!important}
        .library-page .np-library-toolbar{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(94px,112px)!important;grid-template-areas:"search search" "upload sort"!important;gap:8px!important;width:100%!important;margin:0 0 12px!important;align-items:stretch!important}
        .library-page .np-library-search{grid-area:search!important;width:100%!important;height:40px!important;min-width:0!important;box-sizing:border-box!important}
        .library-page .np-library-toolbar-spacer{display:none!important}
        .library-page .np-library-upload-main{grid-area:upload!important;width:100%!important;min-width:0!important;min-height:40px!important;padding:0 8px!important;font-size:11px!important}
        .library-page .np-library-sort-label{grid-area:sort!important;width:100%!important;min-width:0!important;height:40px!important;padding:0 7px!important;font-size:9px!important}
        .library-page .np-library-sort{height:30px!important;padding:0 14px 0 4px!important;font-size:10px!important}
        .library-page .library-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;width:100%!important;max-width:none!important;padding:0 0 20px!important;justify-content:stretch!important;align-items:start!important}
        .library-page .library-card,.library-page .video-card,.library-page .np-library-pending-card{width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:9/16!important;display:grid!important;grid-template-rows:minmax(0,1fr) 40px!important;overflow:hidden!important;border-radius:10px!important}
        .library-page .library-thumb,.library-page .video-thumb,.library-page .np-library-pending-preview{width:100%!important;height:auto!important;min-height:0!important;min-width:0!important;aspect-ratio:9/12!important;flex:0 0 auto!important}
        .library-page .library-thumb video,.library-page .library-thumb img,.library-page .video-thumb video,.library-page .video-thumb img,.library-page .np-library-pending-preview video{width:100%!important;height:100%!important;object-fit:cover!important}
        .library-page .library-info,.library-page .video-info,.library-page .np-library-card-body{min-width:0!important;min-height:0!important;padding:5px 5px 6px!important;display:block!important;overflow:hidden!important}
        .library-page .library-info strong,.library-page .video-info strong,.library-page .np-library-card-body strong{display:block!important;width:100%!important;font-size:9px!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page .np-library-meta-grid,.library-page .np-library-meta-box,.library-page .np-library-card-body small,.library-page .np-library-progress,.library-page .np-library-kebab{display:none!important}
        .library-page .np-library-play-button{height:17px!important;min-height:17px!important;margin:3px 0 0!important;border-radius:5px!important;font-size:7.5px!important;line-height:1!important;padding:0!important}
        .library-page .library-card>.icon-button.danger,.library-page .video-card>.icon-button.danger,.library-page .np-library-pending-card .np-library-cancel-upload{right:4px!important;top:4px!important;width:21px!important;height:21px!important;border-radius:6px!important;font-size:13px!important}
      }
      .step-content:has(.overlay-layout){max-width:1120px!important}
      .overlay-layout{grid-template-columns:minmax(360px,442px) minmax(0,586px)!important;gap:24px!important;justify-content:center!important;align-items:start!important}
      .overlay-layout>.preview-card,.overlay-layout>.overlay-controls{position:relative!important;min-width:0!important;isolation:isolate!important}
      .overlay-layout>.preview-card{z-index:1!important;overflow:hidden!important}
      .overlay-layout>.overlay-controls{z-index:2!important;background:linear-gradient(180deg,rgba(16,25,40,.96),rgba(9,15,26,.97))!important;overflow:hidden!important}
      .overlay-controls .camera-panel,.overlay-controls .overlay-list,.overlay-controls .overlay-item{position:relative!important;z-index:1!important}
      .overlay-controls .layer-text-input,.overlay-controls input[type="text"],.overlay-controls input[type="number"],.overlay-controls select{background:#080f1c!important;color:#f3f8ff!important;border:1px solid rgba(113,156,217,.34)!important;caret-color:#f3f8ff!important}
      .overlay-controls .layer-text-input::placeholder,.overlay-controls input::placeholder{color:#7f93af!important;opacity:1!important}
      .overlay-controls .layer-text-input:focus,.overlay-controls input[type="text"]:focus,.overlay-controls input[type="number"]:focus,.overlay-controls select:focus{border-color:#2b8bff!important;box-shadow:0 0 0 3px rgba(43,139,255,.18)!important;outline:none!important}
      .step-content:has(.overlay-layout){max-width:1080px!important}
      .overlay-layout{grid-template-columns:minmax(320px,410px) minmax(0,540px)!important;gap:18px!important}
      .overlay-layout>.preview-card,.overlay-layout>.overlay-controls{border-radius:16px!important}
      .overlay-layout>.preview-card{padding:14px!important}
      .preview-title span{font-size:11.5px!important;font-weight:850!important}
      .preview-title small{font-size:9px!important}
      .overlay-controls{padding:24px!important;min-height:0!important}
      .overlay-controls .card-heading{margin-bottom:18px!important}
      .overlay-controls .card-heading h2{font-size:22px!important}
      .overlay-controls .card-heading p{font-size:12px!important;line-height:1.48!important}
      .overlay-controls .camera-panel{padding:12px 14px!important;margin-bottom:14px!important}
      .overlay-controls .camera-panel-head>span,.overlay-controls .outline-button{font-size:12px!important}
      .overlay-controls .outline-button{height:38px!important;min-height:38px!important}
      .overlay-controls .overlay-actions{gap:9px!important}
      .overlay-controls .overlay-list{gap:10px!important;max-height:370px!important}
      .overlay-controls .overlay-item{padding:11px!important;gap:11px!important}
      .overlay-controls .overlay-item-main strong{font-size:12px!important}
      .overlay-controls .overlay-item-main small{font-size:10px!important}
      .overlay-controls .overlay-item-main label{font-size:10px!important}
      .overlay-controls select,.overlay-controls input{min-height:40px!important;font-size:12.5px!important}
      .portrait-stage{width:min(100%,300px)!important}
      .portrait-stage{isolation:isolate!important}
      .portrait-stage>video{z-index:0!important}
      .portrait-stage .safe-zone,.portrait-stage .overlay-object,.portrait-stage .clock-object,.portrait-stage .text-object,.portrait-stage .preview-hint{z-index:1!important}
      .settings-page:has(.history-list){max-width:1180px!important;margin:0 auto!important;padding:34px 34px 96px!important}
      .settings-page:has(.history-list) .page-intro{border:0!important;padding:0 0 18px!important;margin:0!important;display:flex!important;align-items:end!important;justify-content:space-between!important;gap:18px!important}
      .settings-page:has(.history-list) .page-intro h1{font-size:27px!important;line-height:1.2!important;margin:0!important}
      .settings-page:has(.history-list) .page-intro .ghost-button{min-height:38px!important;padding:8px 14px!important;border-radius:11px!important;background:rgba(12,22,38,.92)!important;border:1px solid rgba(126,164,218,.28)!important}
      .history-summary.card{border-radius:16px!important;padding:14px!important;margin:0 0 14px!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;background:linear-gradient(180deg,rgba(17,27,43,.9),rgba(9,15,26,.94))!important;border-color:rgba(126,164,218,.2)!important}
      .history-summary.card>div{min-height:70px!important;padding:14px 16px!important;border-radius:13px!important;background:rgba(6,12,22,.62)!important;border:1px solid rgba(126,164,218,.14)!important;display:flex!important;align-items:center!important;gap:12px!important}
      .history-summary.card svg{width:20px!important;height:20px!important;color:#3b97ff!important;flex:0 0 auto!important}
      .history-summary.card small{display:block!important;font-size:10.5px!important;line-height:1.25!important;color:#8fa2bd!important;font-weight:800!important;margin-bottom:3px!important}
      .history-summary.card strong{display:block!important;font-size:20px!important;line-height:1.1!important;color:#f6fbff!important;font-weight:950!important}
      .history-list{display:grid!important;gap:10px!important}
      .history-item.card{min-height:0!important;padding:13px 14px!important;border-radius:15px!important;background:linear-gradient(180deg,rgba(15,24,39,.92),rgba(8,14,24,.96))!important;border:1px solid rgba(126,164,218,.18)!important;box-shadow:0 12px 28px rgba(0,0,0,.2)!important;display:grid!important;grid-template-columns:42px minmax(0,1fr) 132px!important;gap:12px!important;align-items:center!important}
      .history-status{width:38px!important;height:38px!important;border-radius:12px!important;display:grid!important;place-items:center!important}
      .history-status:not(.error){background:rgba(38,158,91,.18)!important;color:#8df0b5!important}
      .history-status.error{background:rgba(220,54,70,.18)!important;color:#ff9aa7!important}
      .history-main{min-width:0!important;display:grid!important;gap:4px!important}
      .history-main strong{font-size:13.5px!important;line-height:1.25!important;color:#f7fbff!important;font-weight:950!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .history-main small{font-size:11px!important;line-height:1.35!important;color:#93a7c0!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .history-tech{display:block!important;font-size:10.5px!important;line-height:1.35!important;color:#8397b1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:100%!important}
      .history-error{display:block!important;font-size:10.5px!important;line-height:1.35!important;color:#ff7e8d!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;max-width:100%!important}
      .history-meta{display:grid!important;justify-items:end!important;gap:7px!important;align-content:center!important}
      .history-duration{font-size:15px!important;line-height:1!important;color:#f8fbff!important;font-weight:950!important;font-variant-numeric:tabular-nums!important}
      .history-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:24px!important;padding:5px 9px!important;border-radius:999px!important;font-size:10px!important;font-weight:900!important;white-space:nowrap!important}
      .history-badge:not(.error){background:rgba(38,158,91,.18)!important;color:#a8f5c4!important}
      .history-badge.error{background:rgba(220,54,70,.16)!important;color:#ff96a3!important}
      @media(max-width:900px){.settings-page:has(.history-list){padding:24px 18px 88px!important}.history-summary.card{grid-template-columns:1fr!important}.history-item.card{grid-template-columns:38px minmax(0,1fr)!important}.history-meta{grid-column:2;justify-items:start!important;grid-auto-flow:column!important;justify-content:start!important}}
      [data-np-ads-old="true"]{display:none!important}
      .np-ads-hub{display:grid!important;gap:14px!important;margin:0 0 18px!important}
      .np-ads-hero{border:1px solid rgba(83,148,255,.22)!important;border-radius:18px!important;background:linear-gradient(135deg,rgba(16,31,54,.96),rgba(9,15,26,.96))!important;padding:18px 20px!important;box-shadow:0 18px 42px rgba(0,0,0,.26)!important}
      .np-ads-hero-top{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important;margin-bottom:14px!important}
      .np-ads-hero h2{font-size:21px!important;line-height:1.2!important;margin:0!important;color:#fff!important}
      .np-ads-hero p{font-size:12px!important;line-height:1.5!important;margin:5px 0 0!important;color:#9fb3ce!important}
      .np-ads-actions{display:flex!important;gap:8px!important;flex-wrap:wrap!important;justify-content:flex-end!important}
      .np-ads-actions button,.np-ads-actions a{min-height:36px!important;border-radius:11px!important;padding:8px 12px!important;border:1px solid rgba(126,164,218,.28)!important;background:rgba(12,22,38,.78)!important;color:#dfeeff!important;font-size:11.5px!important;font-weight:900!important;text-decoration:none!important;display:inline-flex!important;align-items:center!important;gap:7px!important}
      .np-ads-actions .primary{background:#2b8bff!important;border-color:#2b8bff!important;color:#fff!important}
      .np-ads-sidebar{display:grid!important;gap:5px!important;margin:-6px 0 8px 18px!important;padding-left:14px!important;border-left:1px solid rgba(126,164,218,.2)!important}
      .np-ads-sidebar button{width:100%!important;min-height:32px!important;border:0!important;border-radius:10px!important;background:transparent!important;color:#9fb3ce!important;padding:7px 10px!important;text-align:left!important;font-size:12px!important;font-weight:850!important;line-height:1.25!important;display:block!important}
      .np-ads-sidebar button.active{background:rgba(43,139,255,.18)!important;color:#fff!important;box-shadow:inset 3px 0 0 #2b8bff!important}
      .np-ads-sidebar button:hover{background:rgba(126,164,218,.1)!important;color:#f4f9ff!important}
      .np-ads-tabs{display:flex!important;gap:8px!important;flex-wrap:wrap!important;margin-top:14px!important}
      .np-ads-tab{min-height:36px!important;border-radius:999px!important;padding:8px 13px!important;border:1px solid rgba(126,164,218,.22)!important;background:rgba(6,12,22,.52)!important;color:#aebed2!important;font-size:12px!important;font-weight:900!important}
      .np-ads-tab.active{background:#2b8bff!important;border-color:#2b8bff!important;color:#fff!important;box-shadow:0 10px 22px rgba(43,139,255,.24)!important}
      .np-ads-page-title{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:12px!important;margin-bottom:12px!important}
      .np-ads-page-title h3{font-size:17px!important;line-height:1.2!important;margin:0!important;color:#fff!important}
      .np-ads-page-title p{font-size:11.5px!important;line-height:1.45!important;color:#91a6c0!important;margin:4px 0 0!important}
      .np-ads-forms{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;margin-top:14px!important}
      .np-ads-form{display:grid!important;gap:9px!important;border:1px solid rgba(126,164,218,.16)!important;border-radius:14px!important;background:rgba(6,12,22,.5)!important;padding:12px!important}
      .np-ads-form strong{font-size:13px!important;color:#fff!important}
      .np-ads-form input,.np-ads-form select{width:100%!important;min-height:36px!important;border-radius:10px!important;border:1px solid rgba(126,164,218,.24)!important;background:rgba(4,10,19,.72)!important;color:#f7fbff!important;padding:8px 10px!important;font-size:12px!important;font-weight:750!important;box-sizing:border-box!important}
      .np-ads-form-row{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}
      .np-ads-form button{min-height:36px!important;border:1px solid rgba(43,139,255,.8)!important;border-radius:10px!important;background:#2b8bff!important;color:#fff!important;font-size:12px!important;font-weight:950!important}
      .np-ads-kpis{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:10px!important}
      .np-ads-kpi{border:1px solid rgba(126,164,218,.16)!important;border-radius:14px!important;background:rgba(6,12,22,.62)!important;padding:13px 14px!important;min-height:74px!important}
      .np-ads-kpi span{display:block!important;color:#8fa2bd!important;font-size:10.5px!important;font-weight:800!important;margin-bottom:5px!important}
      .np-ads-kpi strong{display:block!important;color:#f7fbff!important;font-size:22px!important;line-height:1!important;font-weight:950!important}
      .np-ads-grid{display:grid!important;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr)!important;gap:14px!important}
      .np-ads-card{border:1px solid rgba(126,164,218,.18)!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(15,24,39,.92),rgba(8,14,24,.96))!important;overflow:hidden!important}
      .np-ads-card-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:14px 16px!important;border-bottom:1px solid rgba(126,164,218,.12)!important}
      .np-ads-card-head strong{font-size:14px!important;color:#fff!important}
      .np-ads-card-head small{font-size:11px!important;color:#91a6c0!important}
      .np-ads-table{display:grid!important}
      .np-ads-row{display:grid!important;grid-template-columns:minmax(0,1.3fr) 92px 90px 90px 84px!important;gap:10px!important;align-items:center!important;padding:11px 16px!important;border-top:1px solid rgba(126,164,218,.1)!important}
      .np-ads-row:first-child{border-top:0!important}
      .np-ads-row b{font-size:12.5px!important;color:#f7fbff!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .np-ads-row small{display:block!important;color:#8fa2bd!important;font-size:10.5px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .np-ads-pill{justify-self:start!important;border-radius:999px!important;padding:5px 8px!important;font-size:10px!important;font-weight:900!important;white-space:nowrap!important;background:rgba(83,148,255,.16)!important;color:#bfdbff!important}
      .np-ads-pill.ok{background:rgba(38,158,91,.18)!important;color:#a8f5c4!important}
      .np-ads-pill.warn{background:rgba(241,181,47,.16)!important;color:#ffd166!important}
      .np-ads-list{display:grid!important;gap:8px!important;padding:12px!important}
      .np-ads-mini{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:10px 11px!important;border-radius:12px!important;background:rgba(6,12,22,.58)!important;border:1px solid rgba(126,164,218,.12)!important}
      .np-ads-mini b{font-size:12px!important;color:#f7fbff!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .np-ads-mini small{font-size:10.5px!important;color:#8fa2bd!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .np-ads-error{padding:11px 13px!important;border-radius:12px!important;background:rgba(220,54,70,.12)!important;border:1px solid rgba(220,54,70,.28)!important;color:#ffacb6!important;font-size:12px!important;line-height:1.45!important}
      .settings-page:has([data-np-ads-hub]){max-width:none!important;width:100%!important;margin:0!important;padding:0!important;background:#f5f7fb!important;color:#0f172a!important}
      .settings-page:has([data-np-ads-hub]) .page-intro{display:none!important}
      .np-ads-hub.np-ads-source-ui{display:block!important;margin:0!important;min-height:calc(100vh - 68px)!important;background:#f5f7fb!important;color:#0f172a!important;padding:24px!important;font-family:"Noto Sans Thai","Segoe UI",system-ui,sans-serif!important}
      .np-ads-source-ui *{box-sizing:border-box!important;letter-spacing:0!important}
      .np-ads-source-ui .np-src-top{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:18px!important;margin-bottom:14px!important}
      .np-ads-source-ui .np-src-brand{display:flex!important;align-items:center!important;gap:10px!important;margin-bottom:6px!important}
      .np-ads-source-ui .np-src-logo{width:32px!important;height:32px!important;border-radius:8px!important;background:#0b1220!important;display:grid!important;place-items:center!important;color:#2563eb!important;font-size:12px!important;font-weight:950!important}
      .np-ads-source-ui .np-src-kicker{font-size:12px!important;font-weight:850!important;letter-spacing:0!important;color:#2563eb!important;text-transform:none!important}
      .np-ads-source-ui h1{margin:0!important;color:#020617!important;font-size:21px!important;line-height:1.2!important;font-weight:950!important}
      .np-ads-source-ui p{margin:5px 0 0!important;color:#64748b!important;font-size:12px!important;line-height:1.45!important}
      .np-ads-source-ui .np-src-button{height:34px!important;border-radius:8px!important;border:1px solid #d8e1ed!important;background:#fff!important;color:#0f172a!important;padding:0 13px!important;font-size:12px!important;font-weight:900!important;box-shadow:0 1px 2px rgba(15,23,42,.05)!important}
      .np-ads-source-ui .np-src-button.primary{border-color:#2563eb!important;background:#2563eb!important;color:#fff!important;box-shadow:0 12px 24px rgba(37,99,235,.2)!important}
      .np-ads-source-ui .np-src-shell{display:grid!important;grid-template-columns:260px minmax(0,1fr)!important;gap:14px!important;align-items:start!important}
      .np-ads-source-ui .np-src-panel,.np-ads-source-ui .np-src-card{background:#fff!important;border:1px solid #dce4ef!important;border-radius:10px!important;box-shadow:0 1px 3px rgba(15,23,42,.06)!important;color:#0f172a!important}
      .np-ads-source-ui .np-src-panel{padding:14px!important;display:grid!important;gap:12px!important}
      .np-ads-source-ui .np-src-panel h3,.np-ads-source-ui .np-src-card h2,.np-ads-source-ui .np-src-card h3{margin:0!important;color:#020617!important;font-size:14px!important;line-height:1.25!important;font-weight:950!important}
      .np-ads-source-ui .np-src-panel small,.np-ads-source-ui .np-src-card small{color:#64748b!important;font-size:11px!important;line-height:1.35!important}
      .np-ads-source-ui .np-src-search,.np-ads-source-ui input,.np-ads-source-ui select{width:100%!important;height:36px!important;border-radius:7px!important;border:1px solid #cfd9e8!important;background:#fff!important;color:#0f172a!important;padding:0 12px!important;font-size:12px!important;font-weight:650!important}
      .np-ads-source-ui input::placeholder{color:#94a3b8!important}
      .np-ads-source-ui .np-src-toggle{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:34px!important;border:1px solid #e2e8f0!important;border-radius:7px!important;padding:7px 10px!important;background:#f8fafc!important;color:#334155!important;font-size:12px!important;font-weight:800!important}
      .np-ads-source-ui .np-src-toggle span:last-child{width:36px!important;height:20px!important;border-radius:999px!important;background:#2563eb!important;position:relative!important}
      .np-ads-source-ui .np-src-toggle span:last-child:after{content:"";position:absolute!important;right:3px!important;top:3px!important;width:14px!important;height:14px!important;border-radius:999px!important;background:#fff!important}
      .np-ads-source-ui .np-src-summary{display:grid!important;gap:0!important}
      .np-ads-source-ui .np-src-summary-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;border-top:1px solid #edf2f7!important;padding:8px 0!important;color:#64748b!important;font-size:12px!important}
      .np-ads-source-ui .np-src-summary-row b{color:#0f172a!important;font-size:12px!important}
      .np-ads-source-ui .np-src-main{display:grid!important;gap:14px!important}
      .np-ads-source-ui .np-src-card{padding:14px!important}
      .np-ads-source-ui .np-src-card-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;margin-bottom:12px!important}
      .np-ads-source-ui .np-src-card-title{min-width:0!important}
      .np-ads-source-ui .np-src-metrics{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
      .np-ads-source-ui .np-src-metric{min-height:92px!important;border:1px solid #dce4ef!important;border-radius:9px!important;background:#fff!important;padding:14px!important;position:relative!important}
      .np-ads-source-ui .np-src-metric span{display:block!important;color:#64748b!important;font-size:11px!important;font-weight:750!important;margin-bottom:5px!important}
      .np-ads-source-ui .np-src-metric strong{display:block!important;color:#020617!important;font-size:22px!important;line-height:1.05!important;font-weight:950!important}
      .np-ads-source-ui .np-src-metric small{display:block!important;margin-top:8px!important;color:#64748b!important;font-size:10.5px!important}
      .np-ads-source-ui .np-src-table{width:100%!important;border:1px solid #dce4ef!important;border-radius:9px!important;overflow:hidden!important;background:#fff!important}
      .np-ads-source-ui .np-src-row{display:grid!important;grid-template-columns:minmax(160px,1.2fr) 110px 160px 130px 130px minmax(160px,.9fr)!important;gap:10px!important;align-items:center!important;min-height:42px!important;padding:9px 12px!important;border-top:1px solid #e8eef6!important;color:#334155!important;font-size:12px!important}
      .np-ads-source-ui .np-src-row:first-child{border-top:0!important}
      .np-ads-source-ui .np-src-row.head{background:#f8fafc!important;color:#64748b!important;font-size:11px!important;font-weight:900!important}
      .np-ads-source-ui .np-src-row b{color:#020617!important;font-size:12px!important;font-weight:950!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .np-ads-source-ui .np-src-row small{display:block!important;color:#64748b!important;font-size:10.5px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .np-ads-source-ui .np-src-pill{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:max-content!important;border-radius:999px!important;padding:4px 9px!important;background:#a16207!important;color:#fff!important;font-size:10.5px!important;font-weight:950!important;white-space:nowrap!important}
      .np-ads-source-ui .np-src-pill.green{background:#2f855a!important}.np-ads-source-ui .np-src-pill.red{background:#dc2626!important}.np-ads-source-ui .np-src-pill.blue{background:#2563eb!important}.np-ads-source-ui .np-src-pill.soft{background:#eff6ff!important;color:#1d4ed8!important;border:1px solid #bfdbfe!important}
      .np-ads-source-ui .np-src-empty{border:1px solid #dce4ef!important;border-radius:9px!important;background:#f8fafc!important;padding:18px!important;text-align:center!important;color:#64748b!important;font-size:13px!important}
      .np-ads-source-ui .np-src-form{display:grid!important;gap:14px!important}
      .np-ads-source-ui .np-src-form-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
      .np-ads-source-ui .np-src-field{display:grid!important;gap:6px!important}
      .np-ads-source-ui .np-src-field label{color:#0f172a!important;font-size:12px!important;font-weight:900!important}
      .np-ads-source-ui .np-src-help{color:#64748b!important;font-size:10.5px!important;line-height:1.4!important}
      .np-ads-source-ui .np-src-notice{border:1px solid #facc15!important;background:#fffbeb!important;color:#92400e!important;border-radius:7px!important;padding:11px 12px!important;font-size:12px!important;font-weight:750!important}
      .np-ads-source-ui .np-src-tabs{display:flex!important;gap:8px!important;border-bottom:1px solid #dce4ef!important;margin:0 -14px 12px!important;padding:0 14px!important}
      .np-ads-source-ui .np-src-tabs button{height:36px!important;border:0!important;border-bottom:2px solid transparent!important;background:transparent!important;color:#64748b!important;font-size:12px!important;font-weight:950!important;padding:0 14px!important}
      .np-ads-source-ui .np-src-tabs button.active{color:#2563eb!important;border-bottom-color:#2563eb!important;background:#f8fafc!important}
      .np-ads-source-ui .np-src-stats{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;margin-bottom:12px!important}
      .np-ads-source-ui .np-src-stat{display:flex!important;align-items:center!important;gap:12px!important;min-height:82px!important;border:1px solid #dce4ef!important;border-radius:9px!important;background:#fff!important;padding:13px!important}
      .np-ads-source-ui .np-src-stat-icon{width:40px!important;height:40px!important;border-radius:9px!important;display:grid!important;place-items:center!important;background:#2563eb!important;color:#fff!important;font-weight:950!important}
      .np-ads-source-ui .np-src-stat strong{display:block!important;color:#020617!important;font-size:22px!important;line-height:1!important;font-weight:950!important}
      .np-ads-source-ui .np-src-stat span{display:block!important;color:#0f172a!important;font-size:12px!important;font-weight:900!important}
      .np-ads-source-ui .np-src-actions{display:flex!important;gap:6px!important;justify-content:flex-end!important;flex-wrap:wrap!important}
      .np-ads-source-ui .np-src-actions button{height:26px!important;border:0!important;border-radius:5px!important;padding:0 8px!important;color:#fff!important;font-size:10.5px!important;font-weight:950!important}
      .np-ads-source-ui .np-src-actions .start{background:#059669!important}.np-ads-source-ui .np-src-actions .edit{background:#334d80!important}.np-ads-source-ui .np-src-actions .copy{background:#4b5f8f!important}.np-ads-source-ui .np-src-actions .rule{background:#2b0710!important}.np-ads-source-ui .np-src-actions .history{background:#6b1d1d!important}.np-ads-source-ui .np-src-actions .delete{background:#943232!important}
      @media(max-width:1180px){.np-ads-source-ui .np-src-shell{grid-template-columns:1fr!important}.np-ads-source-ui .np-src-metrics,.np-ads-source-ui .np-src-stats,.np-ads-source-ui .np-src-form-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.np-ads-source-ui .np-src-row{grid-template-columns:minmax(0,1fr) 90px 100px!important}.np-ads-source-ui .np-src-row>*:nth-child(3)~*{display:none!important}}
      @media(max-width:1180px){.np-ads-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important}.np-ads-grid,.np-ads-forms{grid-template-columns:1fr!important}.np-ads-row{grid-template-columns:minmax(0,1fr) 82px 76px!important}.np-ads-row .np-hide-sm{display:none!important}}
      .step-content.np-live-connect-step{max-width:1180px!important;display:grid!important;grid-template-columns:1fr!important;gap:14px!important;align-items:start!important}
      .step-content.np-live-connect-step>.card{grid-column:1!important;width:100%!important;max-width:none!important;justify-self:stretch!important;box-sizing:border-box!important;margin:0!important;min-width:0!important;border-radius:16px!important;background:linear-gradient(180deg,rgba(16,25,40,.94),rgba(9,15,26,.96))!important;border-color:rgba(126,164,218,.18)!important;box-shadow:0 16px 38px rgba(0,0,0,.34)!important}
      .step-content.np-live-connect-step .np-live-connect-main{grid-column:1!important;width:100%!important;max-width:none!important;justify-self:stretch!important;padding:22px 26px!important}
      .step-content.np-live-connect-step .np-live-connect-main>.card-heading,.step-content.np-live-connect-step .np-live-connect-main .card-heading{margin-bottom:14px!important}
      .step-content.np-live-connect-step .np-live-connect-main .card-heading h2{font-size:22px!important}
      .step-content.np-live-connect-step .np-live-connect-main .card-heading p{font-size:12px!important;line-height:1.45!important}
      .step-content.np-live-connect-step .np-live-connect-panel{grid-column:1!important;width:100%!important;max-width:none!important;justify-self:stretch!important;position:relative!important;padding:20px!important;overflow:hidden!important}
      .step-content.np-live-connect-step .np-live-connect-panel>.np-live-accordion-toggle{width:100%!important;margin:-4px 0 14px!important;padding:0!important;border:0!important;background:transparent!important;color:inherit!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;cursor:pointer!important;text-align:left!important}
      .step-content.np-live-connect-step .np-live-accordion-title{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important}
      .step-content.np-live-connect-step .np-live-accordion-no{width:30px!important;height:30px!important;border-radius:10px!important;display:grid!important;place-items:center!important;background:linear-gradient(135deg,#2f8cff,#6fb5ff)!important;color:#fff!important;font-size:13px!important;font-weight:950!important;box-shadow:0 8px 18px rgba(47,140,255,.28)!important}
      .step-content.np-live-connect-step .np-live-accordion-text{font-size:17px!important;line-height:1.2!important;font-weight:950!important;color:#f7fbff!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .step-content.np-live-connect-step .np-live-accordion-state{flex:0 0 auto!important;width:34px!important;height:34px!important;min-width:34px!important;padding:0!important;border:1px solid rgba(126,164,218,.28)!important;border-radius:999px!important;background:rgba(12,22,38,.82)!important;color:#cfe0f4!important;display:grid!important;place-items:center!important;transition:transform .18s ease,background .18s ease,border-color .18s ease!important}
      .step-content.np-live-connect-step .np-live-accordion-state svg{width:17px!important;height:17px!important;stroke:currentColor!important;stroke-width:2.4!important;fill:none!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      .step-content.np-live-connect-step .np-live-accordion-toggle:hover .np-live-accordion-state{background:rgba(43,139,255,.16)!important;border-color:rgba(83,148,255,.46)!important;color:#eaf4ff!important}
      .step-content.np-live-connect-step .np-live-connect-panel.is-collapsed .np-live-accordion-state{transform:rotate(-90deg)!important}
      .step-content.np-live-connect-step .np-live-connect-panel.is-collapsed{padding-bottom:16px!important;height:auto!important;min-height:0!important;max-height:none!important}
      .step-content.np-live-connect-step .np-live-connect-panel.is-collapsed.np-live-pin-card{height:auto!important;min-height:0!important;display:block!important}
      .step-content.np-live-connect-step .np-live-connect-panel.is-collapsed>*:not(.np-live-accordion-toggle){display:none!important}
      .step-content.np-live-connect-step .np-live-connect-panel>.card-heading{margin-top:0!important}
      .step-content.np-live-connect-step .np-live-ai-tester{grid-column:1!important;padding:18px 20px!important}
      .step-content.np-live-connect-step .np-live-ai-tester .card-heading{margin-bottom:12px!important}
      .step-content.np-live-connect-step .np-live-ai-tester .card-heading h2{font-size:18px!important}
      .step-content.np-live-connect-step .np-live-ai-tester .card-heading p{font-size:12px!important;line-height:1.45!important}
      .step-content.np-live-connect-step .chat-settings-card{grid-column:1!important;padding:20px!important;max-height:560px!important;overflow:auto!important;scrollbar-width:thin;scrollbar-color:rgba(83,148,255,.55) rgba(148,178,224,.08)}
      .step-content.np-live-connect-step .chat-settings-card .card-heading{margin-bottom:12px!important}
      .step-content.np-live-connect-step .chat-settings-card .card-heading h2{font-size:18px!important;line-height:1.25!important}
      .step-content.np-live-connect-step .chat-settings-card .card-heading p{font-size:11.5px!important;line-height:1.45!important}
      .step-content.np-live-connect-step .chat-settings-card .eyebrow{font-size:9.5px!important;margin-bottom:5px!important}
      .step-content.np-live-connect-step .chat-settings-card .field-label,
      .step-content.np-live-connect-step .chat-settings-card label,
      .step-content.np-live-connect-step .chat-settings-card .chat-section-head strong{font-size:11.5px!important;font-weight:850!important;line-height:1.35!important}
      .step-content.np-live-connect-step .chat-settings-card .chat-section-head small,
      .step-content.np-live-connect-step .chat-settings-card .privacy-note,
      .step-content.np-live-connect-step .chat-settings-card .warning-note,
      .step-content.np-live-connect-step .chat-settings-card .clip-info,
      .step-content.np-live-connect-step .chat-settings-card .link-button{font-size:10.5px!important;line-height:1.45!important}
      .step-content.np-live-connect-step .chat-settings-card .provider-pick{gap:8px!important}
      .step-content.np-live-connect-step .chat-settings-card .provider-option{padding:9px 11px!important;border-radius:10px!important;gap:2px!important}
      .step-content.np-live-connect-step .chat-settings-card .provider-option strong{font-size:12px!important;font-weight:900!important}
      .step-content.np-live-connect-step .chat-settings-card .provider-option small{font-size:10px!important;line-height:1.3!important}
      .step-content.np-live-connect-step .chat-settings-card .text-input,
      .step-content.np-live-connect-step .chat-settings-card input,
      .step-content.np-live-connect-step .chat-settings-card textarea{font-size:12px!important;font-weight:750!important;line-height:1.5!important}
      .step-content.np-live-connect-step .chat-settings-card textarea.chat-context{min-height:84px!important;max-height:132px!important}
      .step-content.np-live-connect-step .chat-settings-card .ghost-button,
      .step-content.np-live-connect-step .chat-settings-card .outline-button{font-size:11.5px!important;min-height:34px!important;padding:7px 11px!important}
      .step-content.np-live-connect-step .np-live-pin-card{grid-column:1!important;grid-row:auto!important;padding:20px!important;height:760px!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
      .step-content.np-live-connect-step .np-live-pin-card .card-heading,.step-content.np-live-connect-step .np-live-pin-card .card-heading.compact{margin-bottom:12px!important;flex:0 0 auto!important}
      .step-content.np-live-connect-step .np-live-pin-card>.card-heading{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:16px!important}
      .step-content.np-live-connect-step .np-live-pin-card>.card-heading .ghost-button,
      .step-content.np-live-connect-step .np-live-pin-card>.card-heading button{flex:0 0 auto!important;min-width:142px!important;width:auto!important;padding:9px 14px!important;white-space:nowrap!important;line-height:1.15!important;text-align:center!important}
      .step-content.np-live-connect-step .np-live-pin-card h2{font-size:20px!important;line-height:1.25!important}
      .step-content.np-live-connect-step .np-live-pin-card p{font-size:12px!important;line-height:1.42!important}
      .step-content.np-live-connect-step .pin-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;padding-right:6px!important;display:grid!important;gap:8px!important;scrollbar-width:thin;scrollbar-color:rgba(83,148,255,.55) rgba(148,178,224,.08)}
      .step-content.np-live-connect-step .pin-ai-details{display:block!important;margin:8px 0 10px!important;padding:8px 10px!important;flex:0 0 auto!important;max-height:none!important;overflow:visible!important}
      .step-content.np-live-connect-step .pin-ai-details summary{cursor:pointer!important;list-style:none!important;font-size:11px!important;font-weight:800!important;color:#cfe0f4!important}
      .step-content.np-live-connect-step .pin-ai-details summary::-webkit-details-marker{display:none!important}
      .step-content.np-live-connect-step .pin-ai-strip{display:flex!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;padding:8px 2px 2px!important;scrollbar-width:thin;scrollbar-color:rgba(83,148,255,.55) rgba(148,178,224,.08)}
      .step-content.np-live-connect-step .pin-ai-item{flex:0 0 190px!important;min-height:76px!important;padding:8px 10px!important;border:1px solid rgba(126,164,218,.16)!important;border-radius:12px!important;background:rgba(8,15,27,.78)!important;display:grid!important;grid-template-columns:30px minmax(0,1fr)!important;gap:8px!important;align-items:start!important}
      .step-content.np-live-connect-step .pin-ai-item .pin-order{width:28px!important;height:28px!important;align-self:center!important}
      .step-content.np-live-connect-step .pin-ai-item small{display:-webkit-box!important;-webkit-line-clamp:4!important;-webkit-box-orient:vertical!important;overflow:hidden!important;white-space:normal!important;line-height:1.35!important;color:#c4d1e4!important}
      .step-content.np-live-connect-step .pin-list::-webkit-scrollbar,.step-content.np-live-connect-step .chat-settings-card::-webkit-scrollbar{width:8px}
      .step-content.np-live-connect-step .pin-list::-webkit-scrollbar-track,.step-content.np-live-connect-step .chat-settings-card::-webkit-scrollbar-track{background:rgba(148,178,224,.08);border-radius:999px}
      .step-content.np-live-connect-step .pin-list::-webkit-scrollbar-thumb,.step-content.np-live-connect-step .chat-settings-card::-webkit-scrollbar-thumb{background:rgba(83,148,255,.55);border-radius:999px}
      .step-content.np-live-connect-step .pin-row{min-height:50px!important;padding:8px 10px!important;border-radius:12px!important;background:rgba(8,15,27,.72)!important;border:1px solid rgba(126,164,218,.14)!important;display:grid!important;grid-template-columns:30px 42px minmax(0,1fr) auto!important;gap:10px!important;align-items:center!important}
      .step-content.np-live-connect-step .pin-order{width:28px!important;height:28px!important;border-radius:9px!important;font-size:12px!important}
      .step-content.np-live-connect-step .pin-thumb{width:38px!important;height:38px!important;border-radius:9px!important}
      .step-content.np-live-connect-step .pin-name{min-width:0!important}
      .step-content.np-live-connect-step .pin-name strong{font-size:12.5px!important;line-height:1.3!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .step-content.np-live-connect-step .pin-name small{font-size:10px!important;line-height:1.25!important}
      .step-content.np-live-connect-step .pin-actions{gap:6px!important;display:flex!important;align-items:center!important}
      .step-content.np-live-connect-step .pin-actions .ghost-button,.step-content.np-live-connect-step .pin-actions button{min-height:30px!important;padding:6px 9px!important;font-size:11px!important;border-radius:999px!important;white-space:nowrap!important}
      .step-content.np-live-connect-step .pin-actions .icon-button{width:30px!important;height:30px!important;padding:0!important;border-radius:8px!important}
      .step-content.np-live-connect-step .chat-section{padding:14px 0!important}
      .step-content.np-live-connect-step .chat-section-head{margin-bottom:10px!important}
      .step-content.np-live-connect-step textarea.chat-context{min-height:96px!important;max-height:150px!important}
      .step-content.np-live-connect-step .chat-rules{max-height:210px!important;overflow:auto!important;padding-right:4px!important}
      .step-content.np-live-connect-step .privacy-note,.step-content.np-live-connect-step .warning-note{margin-top:10px!important;padding:10px 12px!important;font-size:10.5px!important;line-height:1.45!important}
      .step-content.np-live-native-step{width:min(100%,1040px)!important;max-width:1040px!important;margin:0 auto!important}
      .step-content.np-live-native-step .live-layout{display:grid!important;grid-template-columns:minmax(260px,400px) minmax(0,1fr)!important;grid-template-areas:"preview status" "chat chat"!important;gap:16px!important;width:100%!important;max-width:1040px!important;margin:0 auto!important;align-items:stretch!important}
      .step-content.np-live-native-step .live-preview{grid-area:preview!important;min-width:0!important;min-height:420px!important;height:420px!important;border-radius:18px!important;background:#3f66ad!important;overflow:hidden!important;position:relative!important;box-shadow:0 18px 42px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.045)!important}
      .step-content.np-live-native-step .live-preview video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;object-fit:cover!important;border-radius:0!important}
      .step-content.np-live-native-step .live-panel{grid-area:status!important;min-width:0!important;min-height:420px!important;height:420px!important;border-radius:18px!important;background:linear-gradient(180deg,rgba(18,29,46,.95),rgba(9,15,26,.97))!important;border:1px solid rgba(126,164,218,.18)!important;box-shadow:0 18px 42px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.045)!important}
      .step-content.np-live-native-step .chat-live-panel{grid-area:chat!important;width:100%!important;min-height:190px!important;border-radius:18px!important;background:linear-gradient(180deg,rgba(18,29,46,.95),rgba(9,15,26,.97))!important;border:1px solid rgba(126,164,218,.18)!important;box-shadow:0 18px 42px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.045)!important}
      body.np-live-preview-blank .step-content.np-live-native-step .live-preview video,
      body.np-live-ui-preview-active .step-content.np-live-native-step .live-preview video{display:none!important}
      .step-content.np-live-native-step .live-panel .primary-button,
      .step-content.np-live-native-step .live-panel .stop-button{border:1px solid rgba(255,112,112,.52)!important;background:rgba(82,18,26,.92)!important;color:#ffd8dc!important;box-shadow:none!important}
      .step-content.np-live-native-step .live-panel .primary-button:hover,
      .step-content.np-live-native-step .live-panel .stop-button:hover{filter:brightness(1.06)!important;transform:none!important}
      @media(max-width:760px){
        .wizard-area{overflow-x:hidden!important}
        .step-content.np-live-native-step{width:calc(100vw - 24px)!important;max-width:calc(100vw - 24px)!important;margin:0 auto!important}
        .step-content.np-live-native-step .live-layout{grid-template-columns:92px minmax(0,1fr)!important;grid-template-rows:285px minmax(150px,auto)!important;grid-template-areas:"preview status" "chat chat"!important;gap:8px!important;width:100%!important;max-width:100%!important;margin:0!important}
        .step-content.np-live-native-step .live-preview{min-height:0!important;height:285px!important;max-height:285px!important;width:92px!important;border-radius:16px!important;background:#3f66ad!important;box-shadow:none!important}
        .step-content.np-live-native-step .live-chip{top:12px!important;left:8px!important;font-size:7.5px!important;padding:6px 8px!important}
        .step-content.np-live-native-step .live-playlist-badge{display:none!important}
        .step-content.np-live-native-step .live-panel{min-height:0!important;height:285px!important;max-height:285px!important;border-radius:16px!important;padding:20px 9px 12px!important;justify-content:flex-start!important;overflow:hidden!important}
        .step-content.np-live-native-step .live-status-icon{width:50px!important;height:50px!important;margin:0 0 8px!important}
        .step-content.np-live-native-step .live-panel .eyebrow{font-size:9px!important;margin:0 0 4px!important}
        .step-content.np-live-native-step .live-panel h2{font-size:16px!important;line-height:1.12!important;margin:0 0 6px!important;text-align:center!important}
        .step-content.np-live-native-step .live-time{font-size:20px!important;letter-spacing:0!important;margin:0 0 8px!important}
        .step-content.np-live-native-step .health-row{padding:8px 2px!important}
        .step-content.np-live-native-step .health-row span{font-size:10px!important;gap:5px!important}
        .step-content.np-live-native-step .health-row strong{font-size:10px!important}
        .step-content.np-live-native-step .live-panel button{width:min(100%,116px)!important;min-height:36px!important;height:36px!important;border-radius:11px!important;font-size:11px!important;margin-top:10px!important}
        .step-content.np-live-native-step .chat-live-panel{min-height:150px!important;border-radius:16px!important}
      }
      @media(max-width:390px){
        .step-content.np-live-native-step{width:calc(100vw - 20px)!important;max-width:calc(100vw - 20px)!important}
        .step-content.np-live-native-step .live-layout{grid-template-columns:84px minmax(0,1fr)!important;grid-template-rows:275px minmax(150px,auto)!important}
        .step-content.np-live-native-step .live-preview{width:84px!important;height:275px!important;max-height:275px!important}
        .step-content.np-live-native-step .live-panel{height:275px!important;max-height:275px!important;padding-top:18px!important}
        .step-content.np-live-native-step .live-panel h2{font-size:15px!important}
        .step-content.np-live-native-step .live-time{font-size:19px!important}
      }
      .dashboard{width:min(100%,1640px);margin:0 auto;padding:28px 40px 64px!important}
      .dashboard .dash-hero{height:306px!important;min-height:306px!important;margin:0 0 18px!important;padding:0!important;border-radius:16px!important;background:#06111f url("./assets/digital-np-dashboard-selected-banner-crop.png") center center / cover no-repeat!important;overflow:hidden!important;box-shadow:0 18px 42px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.08)!important}
      .dashboard .dash-hero>*{display:none!important}
      .dashboard .dash-stats{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:14px!important;margin:0 0 18px!important;clear:none!important}
      .dashboard .stat-card{min-height:118px!important;padding:18px 20px!important;border-radius:14px!important;background:linear-gradient(180deg,rgba(18,28,44,.88),rgba(10,16,27,.92))!important;border-color:rgba(126,164,218,.16)!important}
      .dashboard .stat-card.highlight{background:linear-gradient(150deg,rgba(23,54,42,.72),rgba(10,16,27,.94) 62%)!important;border-color:rgba(34,197,94,.32)!important}
      .dashboard .stat-card svg{width:20px!important;height:20px!important}
      .dashboard .stat-card strong,.dashboard .stat-card b{font-size:28px!important;line-height:1.05!important;letter-spacing:0!important}
      .dashboard .stat-card small,.dashboard .stat-card span{line-height:1.35}
      .dashboard .dash-panel{border-radius:16px!important;padding:22px 24px!important;background:linear-gradient(180deg,rgba(16,25,40,.9),rgba(9,15,26,.94))!important;border-color:rgba(126,164,218,.16)!important}
      .dashboard .dash-panel-head{margin-bottom:14px!important}
      .dashboard .chart{margin:0 0 14px!important}
      .dashboard .chart-bars{height:118px!important}
      .dashboard .chart-bar{max-width:28px!important}
      .dashboard .chart-legend{margin-top:8px!important;font-size:10.5px!important}
      .dashboard .channel-table{border-radius:12px!important;background:rgba(5,10,18,.28)!important}
      .dashboard .channel-row{padding:10px 14px!important;min-height:42px!important;font-size:12px!important}
      .dashboard .channel-row.head{font-size:10.5px!important}
      .dashboard .channel-name small{font-size:10px!important}
      .dashboard .dash-grid{display:grid!important;grid-template-columns:minmax(0,1.35fr) minmax(360px,.9fr)!important;gap:16px!important;align-items:start!important;margin-top:16px!important}
      .dashboard .dash-grid>.dash-panel{min-width:0!important}
      .dashboard .dash-grid>.dash-panel:first-child{height:584px!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
      .dashboard .dash-side{display:grid!important;gap:16px!important;align-content:start!important}
      .dashboard .dash-side>.dash-panel:first-child{min-height:274px!important}
      .dashboard .dash-side>.dash-panel:last-child{min-height:294px!important}
      .dashboard .dash-session-list{gap:0!important}
      .dashboard .dash-grid>.dash-panel:first-child .dash-session-list{flex:1 1 auto!important;min-height:0!important;overflow-y:auto!important;padding-right:8px!important;scrollbar-width:thin;scrollbar-color:rgba(83,148,255,.55) rgba(148,178,224,.08)}
      .dashboard .dash-grid>.dash-panel:first-child .dash-session-list::-webkit-scrollbar{width:8px}
      .dashboard .dash-grid>.dash-panel:first-child .dash-session-list::-webkit-scrollbar-track{background:rgba(148,178,224,.08);border-radius:999px}
      .dashboard .dash-grid>.dash-panel:first-child .dash-session-list::-webkit-scrollbar-thumb{background:rgba(83,148,255,.55);border-radius:999px}
      .dashboard .dash-session{min-height:58px!important;padding:11px 0!important}
      .dashboard .dash-session-icon{width:38px!important;height:38px!important;border-radius:11px!important}
      .dashboard .dash-session-main strong{font-size:13px!important}
      .dashboard .dash-session-main small{font-size:10.5px!important}
      .dashboard .dash-session-dur{font-size:13px!important}
      .dashboard .dash-status-list{gap:10px!important}
      .dashboard .dash-status-row{min-height:56px!important;padding:12px 14px!important;border-radius:12px!important;background:rgba(148,178,224,.055)!important}
      .dashboard .dash-quick{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
      .dashboard .dash-quick .quick-btn{min-height:92px!important;padding:16px!important;border-radius:12px!important}
      .dashboard .dash-link{font-size:12px!important}
      .np-topup-page{width:min(100%,1540px);margin:0 auto;padding:22px 28px 96px;color:#f5f8ff}
      .np-topup-hero{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px;padding:24px;border:1px solid rgba(126,164,218,.24);border-radius:16px;background:linear-gradient(135deg,rgba(15,27,45,.96),rgba(7,13,24,.98) 58%,rgba(73,48,8,.68));box-shadow:0 18px 44px rgba(0,0,0,.28)}
      .np-topup-hero h1{margin:4px 0 4px;font-size:27px;line-height:1.16}
      .np-topup-hero p{margin:0;color:#aebdd3;font-size:12.5px}
      .np-topup-balance{min-width:220px;padding:16px 18px;border:1px solid rgba(245,158,11,.46);border-radius:14px;background:rgba(245,158,11,.12);text-align:right}
      .np-topup-balance span{display:block;color:#ffd99a;font-size:11px;font-weight:900}
      .np-topup-balance strong{display:block;margin-top:4px;color:#fff;font-size:30px;line-height:1}
      .np-current-package{margin-bottom:18px;padding:18px;border:1px solid rgba(245,158,11,.42);border-radius:16px;background:linear-gradient(180deg,rgba(16,25,40,.94),rgba(8,10,13,.98));box-shadow:0 18px 44px rgba(0,0,0,.26)}
      .np-current-package-top{display:grid;grid-template-columns:52px 1fr auto;gap:16px;align-items:center;margin-bottom:18px}
      .np-current-icon{width:48px;height:48px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(135deg,#fde68a,#2563eb);color:#fff;font-size:23px;font-weight:950}
      .np-current-package span,.np-package-kicker{display:block;color:#fbbf24;font-size:12px;font-weight:850;letter-spacing:0;text-transform:none}
      .np-current-package h2{margin:4px 0 2px;font-size:28px;line-height:1;color:#fff}
      .np-current-package p{margin:0;color:#aebdd3;font-size:12px}
      .np-current-days{min-width:110px;padding:14px 18px;border:1px solid rgba(245,158,11,.48);border-radius:14px;background:rgba(245,158,11,.1);text-align:center;color:#fff}
      .np-current-days b{display:block;color:#ffd166;font-size:26px;line-height:1}
      .np-current-limits{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}
      .np-current-limit small{display:flex;justify-content:space-between;margin-bottom:8px;color:#dbe9fb;font-weight:900}
      .np-limit-bar{height:8px;border-radius:99px;background:rgba(245,158,11,.18);overflow:hidden}
      .np-limit-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#fbbf24,#f59e0b)}
      .np-package-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px}
      .np-topup-page .eyebrow{font-size:12px!important;font-weight:850!important;letter-spacing:0!important;text-transform:none!important;color:#8fb8ff!important;margin-bottom:6px!important}
      .np-package-head h1{margin:4px 0 4px;font-size:27px;line-height:1.16;color:#fff}
      .np-package-head p{margin:0;color:#93a6c0;font-size:12px}
      .np-package-count{min-width:170px;padding:12px 14px;border:1px solid rgba(245,158,11,.46);border-radius:12px;background:rgba(245,158,11,.1);text-align:right}
      .np-package-count span{display:block;color:#ffd99a;font-size:10.5px;font-weight:950}
      .np-package-count strong{display:block;margin-top:2px;color:#fff;font-size:24px;line-height:1}
      .np-section-divider{height:1px;margin:18px 0;background:rgba(126,164,218,.18)}
      .np-topup-layout{display:grid;grid-template-columns:1fr;gap:16px;align-items:start}
      .np-topup-card{border:1px solid rgba(126,164,218,.22);border-radius:16px;background:linear-gradient(180deg,rgba(16,25,40,.94),rgba(9,15,26,.98));box-shadow:0 18px 44px rgba(0,0,0,.24);padding:18px}
      .np-topup-card h2{margin:0 0 6px;font-size:18px;line-height:1.2}
      .np-topup-card>p{margin:0 0 16px;color:#93a6c0;font-size:12px}
      .np-topup-packages{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px;align-items:stretch}
      .np-topup-package{position:relative;display:grid;grid-template-rows:auto auto 1fr auto;gap:11px;width:100%;min-height:246px;padding:15px;border:1px solid rgba(245,158,11,.34);border-radius:14px;background:linear-gradient(180deg,rgba(15,17,17,.98),rgba(7,8,9,.98));box-shadow:0 18px 42px rgba(0,0,0,.28)}
      .np-topup-package.is-selected{border-color:#f59e0b;box-shadow:0 0 0 1px rgba(245,158,11,.6),0 18px 36px rgba(245,158,11,.14)}
      .np-topup-package.is-current{border-color:#fbbf24;box-shadow:0 0 0 1px rgba(251,191,36,.62),0 20px 44px rgba(245,158,11,.12)}
      .np-topup-package h3{margin:0;color:#fff;font-size:16px;line-height:1.2}
      .np-package-badge{position:absolute;top:16px;right:16px;padding:6px 10px;border-radius:99px;background:rgba(245,158,11,.18);color:#ffd166;font-size:10px;font-weight:950}
      .np-topup-price{padding:13px 15px;border:1px solid rgba(245,158,11,.28);border-radius:12px;background:rgba(245,158,11,.04);font-size:25px;font-weight:950;color:#ffd166}
      .np-topup-meta{display:grid;gap:8px}
      .np-topup-meta span{display:flex;align-items:center;gap:8px;min-height:24px;font-size:11.5px;color:#f5f8ff;font-weight:850}
      .np-topup-meta span:before{content:'✓';display:grid;place-items:center;width:16px;height:16px;border-radius:999px;border:1px solid rgba(251,191,36,.8);color:#fbbf24;font-size:10px}
      .np-topup-package button,.np-topup-submit{width:100%;min-height:42px;border-radius:11px;border:1px solid rgba(245,158,11,.62);background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0b1220;font-weight:950}
      .np-topup-package button.is-current{background:linear-gradient(135deg,#d6a63a,#b88418);border-color:rgba(245,158,11,.8);color:#0b1220}
      .np-topup-package button:disabled{cursor:not-allowed;opacity:.74}
      .np-payment-modal-backdrop{position:fixed;inset:0;z-index:99998;display:grid;place-items:center;padding:24px;background:rgba(0,4,10,.74);backdrop-filter:blur(9px)}
      .np-payment-modal{width:min(520px,calc(100vw - 32px));border:1px solid rgba(245,158,11,.58);border-radius:16px;background:linear-gradient(145deg,#071525,#070a11 64%,#171107);box-shadow:0 30px 100px rgba(0,0,0,.62);color:#f5f8ff;overflow:hidden}
      .np-payment-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:20px 20px 14px;border-bottom:1px solid rgba(126,164,218,.2);background:rgba(8,21,36,.86)}
      .np-payment-modal-head h2{margin:0 0 4px;font-size:22px;line-height:1.2;color:#fff}.np-payment-modal-head p{margin:0;color:#aebdd3;font-size:12px;line-height:1.45}
      .np-payment-close{width:38px;height:38px;border:1px solid rgba(126,164,218,.32);border-radius:10px;background:#071423;color:#dcecff;font-size:24px;cursor:pointer}
      .np-payment-modal-body{display:grid;gap:12px;padding:18px 20px 20px}
      .np-payment-info{display:grid;gap:10px}
      .np-payment-line{display:grid;grid-template-columns:130px minmax(0,1fr);gap:12px;align-items:center;min-height:46px;padding:10px 12px;border:1px solid rgba(126,164,218,.18);border-radius:11px;background:rgba(148,178,224,.055)}
      .np-payment-line.has-copy{grid-template-columns:130px minmax(0,1fr) 38px}
      .np-payment-line span{color:#91a6c0;font-size:12px;font-weight:850}.np-payment-line strong{color:#fff;font-size:14px;line-height:1.35;word-break:break-word}.np-payment-line.amount strong{color:#ffd166;font-size:20px}
      .np-payment-copy{width:34px;height:34px;border:1px solid rgba(245,158,11,.58);border-radius:9px;background:rgba(245,158,11,.1);color:#ffd166;display:grid;place-items:center;cursor:pointer}
      .np-payment-copy:hover{background:rgba(245,158,11,.2);border-color:#fbbf24;color:#fff}.np-payment-copy svg{width:17px;height:17px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
      .np-payment-slip{display:grid;gap:8px;margin-top:2px;color:#dce8f8;font-size:12px;font-weight:850}.np-payment-slip input{width:100%;min-height:42px;border:1px solid rgba(126,164,218,.34);border-radius:10px;background:#071423;color:#f5f8ff;padding:9px}
      .np-payment-submit{width:100%;min-height:44px;border:1px solid rgba(245,158,11,.72);border-radius:11px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0b1220;font-weight:950;cursor:pointer}.np-payment-error{min-height:18px;color:#ff9b9b;font-weight:850;font-size:12px}
      .np-history-launch{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:18px 0;padding:14px 16px;border:1px solid rgba(126,164,218,.18);border-radius:12px;background:rgba(148,178,224,.045)}
      .np-history-launch h2{margin:0 0 2px;font-size:17px;color:#fff}
      .np-history-launch p{margin:0;color:#93a6c0;font-size:12px}
      .np-history-launch button{min-height:40px;padding:9px 14px;border-radius:10px;border:1px solid rgba(245,158,11,.62);background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#0b1220;font-weight:950;white-space:nowrap}
      .np-history-dialog{width:min(1280px,calc(100vw - 72px));height:min(760px,calc(100vh - 72px));max-width:none;max-height:none;border:1px solid rgba(126,164,218,.32);border-radius:18px;background:#0b1423;color:#f5f8ff;padding:0;box-shadow:0 30px 90px rgba(0,0,0,.66);overflow:hidden}
      .np-history-dialog::backdrop{background:rgba(0,0,0,.72);backdrop-filter:blur(4px)}
      .np-history-dialog-inner{height:100%;display:grid;grid-template-rows:auto auto 1fr;padding:24px}
      .np-history-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}
      .np-history-dialog h2{margin:0 0 4px;font-size:20px}
      .np-history-dialog p{margin:0;color:#93a6c0;font-size:12px}
      .np-history-close{width:38px;height:38px;border-radius:10px;border:1px solid rgba(126,164,218,.22);background:rgba(148,178,224,.08);color:#fff;font-weight:950}
      .np-topup-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .np-topup-tabs button{min-height:34px;padding:7px 12px;border-radius:999px;background:rgba(15,27,45,.86);border:1px solid rgba(126,164,218,.22);color:#cbd8ea;font-size:12px;font-weight:900}
      .np-topup-tabs button.active{background:#f59e0b;border-color:#f59e0b;color:#06111f}
      .np-topup-list{display:grid;align-content:start;gap:10px;min-height:0;overflow:auto;padding-right:4px}
      .np-topup-item{display:grid;grid-template-columns:1fr auto;gap:12px;padding:14px;border:1px solid rgba(126,164,218,.18);border-radius:12px;background:rgba(6,13,24,.64)}
      .np-topup-item strong{display:block;color:#fff}
      .np-topup-item small{display:block;margin-top:3px;color:#91a6c0}
      .np-status{display:inline-flex;align-items:center;justify-content:center;min-width:96px;height:30px;border-radius:999px;font-size:12px;font-weight:950}
      .np-status.pending{background:rgba(245,158,11,.14);color:#ffd99a;border:1px solid rgba(245,158,11,.48)}
      .np-status.approved{background:rgba(34,197,94,.14);color:#86efac;border:1px solid rgba(34,197,94,.48)}
      .np-status.rejected{background:rgba(248,113,113,.14);color:#fecaca;border:1px solid rgba(248,113,113,.48)}
      .np-topup-empty{padding:18px;border:1px dashed rgba(126,164,218,.24);border-radius:12px;color:#91a6c0;text-align:center}
      @media(max-width:1280px){.dashboard{padding-left:28px!important;padding-right:28px!important}.dashboard .dash-stats{grid-template-columns:repeat(3,minmax(0,1fr))!important}.dashboard .dash-grid{grid-template-columns:1fr!important}.dashboard .dash-side{grid-template-columns:1fr 1fr!important}}
      @media(max-width:1180px){.np-topup-hero{align-items:flex-start;flex-direction:column}.np-topup-balance{text-align:left}.np-current-package-top{grid-template-columns:48px 1fr}.np-current-days{grid-column:1/-1;text-align:left}.np-current-limits{grid-template-columns:repeat(2,minmax(0,1fr))}.np-package-head{align-items:flex-start;flex-direction:column}.np-package-count{text-align:left}}
      @media(max-width:760px){.np-topup-page{padding:14px 12px 88px}.np-topup-card{padding:14px;border-radius:14px}.np-package-head{gap:10px;margin-bottom:12px}.np-package-head h1{font-size:23px}.np-package-head p{font-size:11px;line-height:1.45}.np-package-count{width:100%;min-width:0;padding:10px 12px;text-align:left}.np-package-count strong{font-size:21px}.np-current-package{padding:14px;border-radius:14px}.np-current-package-top{gap:11px;margin-bottom:14px}.np-current-package h2{font-size:22px}.np-current-package p{font-size:11px;line-height:1.4}.np-current-days{padding:10px 12px}.np-current-days b{font-size:21px}.np-current-limits{gap:8px}.np-current-limit{min-width:0;padding:9px 10px;border:1px solid rgba(126,164,218,.14);border-radius:10px;background:rgba(148,178,224,.045)}.np-current-limit small{gap:6px;margin-bottom:6px;font-size:10.5px}.np-limit-bar{height:6px}.np-topup-card h2{font-size:17px}.np-topup-card>p{margin-bottom:12px;font-size:11px;line-height:1.45}.np-topup-packages{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.np-topup-package{min-height:0;padding:10px;gap:8px;border-radius:11px}.np-topup-package h3{font-size:14px;line-height:1.15}.np-package-kicker{font-size:10px!important}.np-package-badge{top:9px;right:9px;padding:4px 6px;font-size:8px}.np-topup-price{padding:9px 10px;font-size:17px;line-height:1.1}.np-topup-price small{font-size:9px!important;line-height:1.2}.np-topup-meta{grid-template-columns:1fr;gap:3px}.np-topup-meta span{min-height:19px;font-size:9.5px;line-height:1.2;gap:4px}.np-topup-meta span:before{width:12px;height:12px;font-size:8px;flex:0 0 12px}.np-topup-package button,.np-topup-submit{min-height:36px;padding:7px 6px;font-size:10.5px}}
      @media(max-width:1280px){.step-content.np-live-connect-step{grid-template-columns:1fr!important}.step-content.np-live-connect-step .np-live-ai-tester,.step-content.np-live-connect-step .chat-settings-card,.step-content.np-live-connect-step .np-live-pin-card{grid-column:1!important;grid-row:auto!important}.step-content.np-live-connect-step .np-live-pin-card{height:560px!important}}
      @media(max-width:900px){.dashboard .dash-side,.dashboard .dash-quick{grid-template-columns:1fr!important}.dashboard .dash-hero{height:190px!important;min-height:190px!important}.dashboard .channel-row{grid-template-columns:1.35fr .9fr .7fr .9fr!important}.dashboard .channel-row>span:nth-child(5),.dashboard .channel-row>span:nth-child(6){display:none!important}}
      @media(max-width:1180px){.np-live-video-card-patched>.np-live-schedule-card{grid-template-columns:1fr;align-items:stretch}.np-live-video-card-patched>.np-live-schedule-card .np-live-schedule-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:1180px){.overlay-layout{grid-template-columns:1fr!important}.overlay-layout>.preview-card,.overlay-layout>.overlay-controls{width:min(100%,640px)!important;margin:0 auto!important}}
      @media(max-width:980px){.np-live-video-card-patched{grid-template-columns:1fr}.np-live-video-card-patched>.np-live-video-queue,.np-live-video-card-patched>.np-live-main-video,.np-live-video-card-patched>.np-live-schedule-card,.np-live-video-card-patched>.dropzone,.np-live-video-card-patched>.video-list{grid-column:1;grid-row:auto}.np-live-extra-card .np-live-queue-item{grid-template-columns:62px 1fr;align-items:start}.np-live-extra-card .np-live-queue-actions{justify-content:flex-start}.np-live-extra-card .np-live-queue-cell{grid-column:auto}}
      @media(max-width:760px){.np-live-extra-card .np-live-row,.np-live-extra-card .np-live-schedule-grid{grid-template-columns:1fr}}
      .main-area{background:linear-gradient(180deg,#070c14 0%,#05080f 100%)!important;color:#f7f9ff!important}
      .topbar{background:#090f18!important;border-bottom:1px solid rgba(126,164,218,.18)!important}
      .sidebar{background:linear-gradient(180deg,#071120 0%,#050a12 100%)!important;border-right:1px solid rgba(58,91,134,.55)!important;box-shadow:16px 0 46px rgba(0,0,0,.26)!important}
      .sidebar .brand{padding:0 10px 22px!important;margin-bottom:20px!important;border-bottom:1px solid rgba(126,164,218,.18)!important}
      .sidebar .brand-logo{width:54px!important;height:54px!important;border-radius:10px!important}
      .sidebar .brand strong{font-size:18px!important;line-height:1.05!important;color:#fff!important}
      .sidebar .brand small{color:#9fb2cf!important;font-size:11px!important;letter-spacing:0!important}
      .sidebar nav{display:grid!important;gap:12px!important}
      .sidebar nav button{position:relative!important;display:grid!important;grid-template-columns:42px minmax(0,1fr) 8px!important;align-items:center!important;gap:12px!important;min-height:54px!important;width:100%!important;padding:9px 12px!important;border:1px solid rgba(58,104,158,.58)!important;border-radius:12px!important;background:linear-gradient(180deg,rgba(9,23,39,.94),rgba(5,12,22,.98))!important;color:#d7e3f2!important;font-size:14px!important;font-weight:900!important;text-align:left!important;box-shadow:none!important}
      .sidebar nav button svg{width:32px!important;height:32px!important;padding:7px!important;border:1px solid rgba(245,158,11,.55)!important;border-radius:9px!important;color:#fbbf24!important;background:rgba(245,158,11,.055)!important}
      .sidebar nav button span{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      .sidebar nav button::after{content:''!important;width:8px!important;height:8px!important;border-radius:999px!important;background:#fbbf24!important;opacity:.78!important;box-shadow:0 0 14px rgba(251,191,36,.5)!important}
      .sidebar nav button:hover:not(.active){border-color:rgba(245,158,11,.7)!important;background:linear-gradient(90deg,rgba(12,32,55,.96),rgba(9,17,28,.98))!important;color:#fff!important}
      .sidebar nav button.active{background:linear-gradient(90deg,#0b83ff 0%,#0b57d0 78%,rgba(245,158,11,.12) 100%)!important;border:1px solid rgba(125,189,255,.92)!important;color:#fff!important;box-shadow:0 15px 34px rgba(10,124,255,.3),inset 3px 0 0 #fbbf24!important}
      .sidebar nav button.active svg{border-color:rgba(255,255,255,.58)!important;background:rgba(255,255,255,.1)!important;color:#fff!important}
      .sidebar nav button.active::after{opacity:1!important}
      .sidebar nav button.np-force-active{background:linear-gradient(90deg,#0b83ff 0%,#0b57d0 78%,rgba(245,158,11,.12) 100%)!important;border:1px solid rgba(125,189,255,.92)!important;color:#fff!important;box-shadow:0 15px 34px rgba(10,124,255,.3),inset 3px 0 0 #fbbf24!important}
      .sidebar nav button.np-force-active svg{border-color:rgba(255,255,255,.58)!important;background:rgba(255,255,255,.1)!important;color:#fff!important}
      .sidebar nav button.np-force-active::after{opacity:1!important}
      .sidebar-bottom{border-top:1px solid rgba(126,164,218,.18)!important;padding-top:16px!important}
      .system-state,.license-chip{background:rgba(12,24,40,.72)!important;border:1px solid rgba(58,104,158,.42)!important;border-radius:12px!important}
      .sidebar-bottom>button,.license-signout{min-height:48px!important;border:1px solid rgba(58,104,158,.58)!important;border-radius:12px!important;background:linear-gradient(180deg,rgba(9,23,39,.94),rgba(5,12,22,.98))!important;color:#d7e3f2!important}
      .sidebar-bottom>button svg,.license-signout svg{color:#fbbf24!important}
      .np-storage-intro{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;margin:0 0 22px!important;padding:0!important;border:0!important;background:transparent!important}
      .np-storage-intro h1{display:flex!important;align-items:center!important;gap:12px!important;margin:0!important;font-size:25px!important;line-height:1.18!important}
      .np-storage-intro h1:before{content:'';width:22px;height:22px;border-radius:5px;border:2px solid #fbbf24;background:linear-gradient(180deg,rgba(251,191,36,.16),rgba(14,25,42,.9));box-shadow:inset 0 0 0 4px rgba(0,0,0,.28)}
      .np-storage-intro p{display:block!important;margin:6px 0 0!important;color:#aebdd3!important;font-size:12px!important}
      .np-storage-intro .eyebrow{display:none!important}
      .np-storage-package-strip{display:grid;grid-template-columns:240px minmax(110px,160px) minmax(110px,160px) minmax(110px,160px) minmax(0,1fr);gap:0;align-items:center;margin:0 0 18px;padding:18px 22px;border:1px solid rgba(245,158,11,.58);border-radius:14px;background:linear-gradient(100deg,rgba(8,37,77,.95),rgba(8,12,15,.98) 46%,rgba(58,37,6,.78));box-shadow:0 18px 42px rgba(0,0,0,.28)}
      .np-storage-package-strip>div{min-height:58px;display:flex;align-items:center;padding:0 22px;border-right:1px solid rgba(245,158,11,.28)}
      .np-storage-package-strip>div:last-child{border-right:0}
      .np-storage-plan{gap:12px;padding-left:0!important}
      .np-storage-icon{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#1377ff,#8fd5ff);color:#fff;font-weight:950;box-shadow:0 10px 24px rgba(19,119,255,.28)}
      .np-storage-kicker{display:block;color:#8fb8ff;font-size:11px;font-weight:950;line-height:1.2}
      .np-storage-title{display:block;margin-top:3px;color:#fff;font-size:15px;font-weight:950;line-height:1.2}
      .np-storage-sub{display:block;margin-top:2px;color:#aebdd3;font-size:10.5px;font-weight:750;line-height:1.25}
      .np-storage-metric{display:grid!important;align-content:center!important;gap:4px!important}
      .np-storage-metric span{color:#8fb8ff;font-size:11px;font-weight:950}
      .np-storage-metric strong{color:#fff;font-size:22px;line-height:1;font-weight:950}
      .np-storage-meter{display:block!important;padding-right:0!important}
      .np-storage-meter-top{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:10px}
      .np-storage-meter strong{display:block;color:#fff;font-size:13px;font-weight:950}
      .np-storage-meter small{display:block;margin-top:3px;color:#fbbf24;font-size:11px;font-weight:900}
      .np-storage-meter-right{text-align:right;color:#f8fbff;font-size:11px;font-weight:900;white-space:nowrap}
      .np-storage-bar{height:8px;border-radius:999px;background:rgba(43,60,82,.9);overflow:hidden}
      .np-storage-bar i{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#38bdf8,#fbbf24)}
      .np-storage-foot{margin-top:9px;color:#aebdd3;font-size:10.5px;text-align:right}
      @media(max-width:1180px){.np-storage-package-strip{grid-template-columns:1fr 1fr}.np-storage-package-strip>div{border-right:0;border-bottom:1px solid rgba(245,158,11,.2);padding:14px 0}.np-storage-package-strip>div:last-child{grid-column:1/-1;border-bottom:0}.np-storage-intro{align-items:flex-start!important;flex-direction:column!important}}
      @media(max-width:900px){.np-live-reset-top{position:static!important;right:auto!important;top:auto!important}}
      .card,.dash-panel,.stat-card,.license-card,.admin-panel,.ready-hero,.import-panel,.np-topup-card,.np-src-card,.np-live-extra-card,.np-live-connect-panel{background:linear-gradient(180deg,rgba(16,25,40,.96),rgba(9,15,26,.98))!important;border:1px solid rgba(126,164,218,.22)!important;box-shadow:0 18px 44px rgba(0,0,0,.28)!important}
      .dash-hero,.ready-hero,.np-current-package,.np-topup-package.is-current{border-color:rgba(245,158,11,.64)!important;background:linear-gradient(180deg,rgba(15,18,22,.98),rgba(8,12,18,.98))!important;box-shadow:0 18px 44px rgba(0,0,0,.28)!important}
      .primary-button,.tiktok-button,.np-src-button.primary,.np-topup-submit,.np-history-launch button,.np-topup-tabs button.active{border-color:rgba(245,158,11,.72)!important;background:linear-gradient(135deg,#fbbf24,#f59e0b)!important;color:#10141f!important;box-shadow:none!important}
      .ghost-button,.outline-button,.soft-button,.np-live-queue-pick,.np-src-button,.icon-button,.engine-pill,.status-pill{background:rgba(16,28,45,.88)!important;border-color:rgba(126,164,218,.24)!important;color:#dce8f8!important;box-shadow:none!important}
      .ghost-button:hover,.outline-button:hover,.soft-button:hover,.np-live-queue-pick:hover,.np-src-button:hover,.icon-button:hover{border-color:rgba(245,158,11,.58)!important;background:rgba(245,158,11,.12)!important;color:#fff!important}
      @media(max-width:650px){
        .dashboard{position:relative!important;z-index:1001!important;display:block!important;width:100%!important;max-width:none!important;margin:0!important;padding:10px 10px 154px!important;visibility:visible!important;opacity:1!important;overflow:visible!important}
        .dashboard>*{visibility:visible!important;opacity:1!important}
        .dashboard .dash-hero{display:none!important}
        .dashboard .dash-stats{position:relative!important;z-index:1!important;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:4px!important;width:100%!important;margin:0 0 10px!important;padding:0!important;overflow:visible!important}
        .dashboard .stat-card{position:relative!important;display:block!important;min-width:0!important;width:auto!important;height:82px!important;min-height:82px!important;padding:0!important;border-radius:10px!important;overflow:hidden!important;text-align:center!important;background:linear-gradient(180deg,rgba(17,27,42,.96),rgba(9,15,26,.98))!important;border:1px solid rgba(126,164,218,.24)!important;box-shadow:0 8px 18px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.06)!important}
        .dashboard .stat-card.highlight{border-color:rgba(34,197,94,.45)!important;background:linear-gradient(155deg,rgba(18,58,43,.8),rgba(9,15,26,.98) 64%)!important}
        .dashboard .stat-card .stat-top{position:absolute!important;top:6px!important;left:5px!important;right:4px!important;height:14px!important;display:flex!important;align-items:center!important;gap:2px!important;min-width:0!important;overflow:hidden!important}
        .dashboard .stat-card .stat-icon{position:static!important;width:13px!important;height:13px!important;min-width:13px!important;margin:0!important;border-radius:5px!important;flex:0 0 13px!important}
        .dashboard .stat-card svg{width:7px!important;height:7px!important}
        .dashboard .stat-card .stat-trend,.dashboard .stat-card>span:not(.stat-icon){display:block!important;min-width:0!important;max-width:100%!important;margin:0!important;padding:0!important;background:transparent!important;color:#c9b77a!important;font-size:5.8px!important;font-weight:850!important;line-height:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;text-align:left!important}
        .dashboard .stat-card .stat-value,.dashboard .stat-card strong,.dashboard .stat-card b{position:absolute!important;left:2px!important;right:2px!important;top:27px!important;display:block!important;max-width:none!important;margin:0!important;color:#f8fbff!important;font-size:18px!important;font-weight:950!important;line-height:1!important;text-align:center!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:clip!important;letter-spacing:0!important}
        .dashboard .stat-card .stat-value small,.dashboard .stat-card strong small,.dashboard .stat-card b small{font-size:9px!important;line-height:1!important}
        .dashboard .stat-card .stat-label,.dashboard .stat-card small{position:absolute!important;left:3px!important;right:3px!important;bottom:8px!important;display:-webkit-box!important;margin:0!important;color:#c7d2e5!important;font-size:6.2px!important;font-weight:800!important;line-height:1.08!important;text-align:center!important;white-space:normal!important;overflow:hidden!important;text-overflow:ellipsis!important;-webkit-line-clamp:2!important;-webkit-box-orient:vertical!important}
        .dashboard .dash-grid{position:relative!important;z-index:1!important;display:grid!important;grid-template-columns:1fr!important;gap:10px!important;margin-top:0!important;visibility:visible!important;opacity:1!important}
        .dashboard .dash-panel{display:block!important;width:100%!important;min-width:0!important;padding:12px!important;border-radius:14px!important;overflow:hidden!important}
        .dashboard .dash-panel-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin-bottom:10px!important}
        .dashboard .dash-panel-head h2{font-size:13px!important;line-height:1.2!important;margin:0!important}
        .dashboard .dash-panel-head .dash-link{font-size:9px!important;white-space:nowrap!important}
        .dashboard .chart-bars{height:104px!important}
        .dashboard .chart-legend{font-size:8px!important}
        .dashboard .channel-row{grid-template-columns:minmax(0,1.25fr) .7fr .7fr .82fr!important;gap:6px!important;padding:9px 8px!important;min-height:38px!important;font-size:10px!important}
        .dashboard .channel-row.head{font-size:8px!important}
        .dashboard .channel-name small{font-size:8px!important}
        .dashboard .dash-side{display:grid!important;grid-template-columns:1fr!important;gap:10px!important}
        .library-page{width:100%!important;max-width:none!important;margin:0!important;padding:18px 10px 150px!important;overflow:visible!important}
        .library-page [data-np-storage-package]{width:100%!important;margin:0 0 14px!important;padding:16px!important;border-radius:16px!important;overflow:hidden!important}
        .library-page [data-np-storage-package] *{max-width:100%!important}
        .np-library-toolbar{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(94px,112px)!important;grid-template-areas:"search search" "upload sort"!important;gap:8px!important;width:100%!important;margin:0 0 12px!important;align-items:stretch!important}
        .np-library-search{grid-area:search!important;width:100%!important;height:43px!important;min-width:0!important;border-radius:10px!important;padding:0 12px!important;font-size:12px!important;box-sizing:border-box!important}
        .np-library-toolbar-spacer{display:none!important}
        .np-library-upload-main{grid-area:upload!important;width:100%!important;min-width:0!important;min-height:44px!important;padding:0 10px!important;border-radius:10px!important;font-size:12px!important;box-shadow:0 10px 22px rgba(18,135,255,.2)!important}
        .np-library-sort-label{grid-area:sort!important;width:100%!important;min-width:0!important;height:44px!important;display:grid!important;grid-template-columns:auto 1fr!important;gap:5px!important;align-items:center!important;padding:0 8px!important;border:1px solid rgba(126,164,218,.25)!important;border-radius:10px!important;background:rgba(12,21,35,.86)!important;font-size:9px!important;line-height:1!important;box-sizing:border-box!important;overflow:hidden!important}
        .np-library-sort{width:100%!important;min-width:0!important;height:32px!important;padding:0 16px 0 6px!important;border:0!important;background:transparent!important;font-size:10px!important}
        .np-library-sort-icon{display:none!important}
        .library-page .library-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important;width:100%!important;max-width:none!important;padding:0 0 20px!important;justify-content:stretch!important;align-items:start!important;overflow:visible!important}
        .library-page .library-card,.library-page .video-card,.library-page .np-library-pending-card{width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:9/16!important;border-radius:10px!important;border-color:rgba(255,255,255,.54)!important;box-shadow:0 10px 22px rgba(0,0,0,.3)!important;background:#07090d!important;display:grid!important;grid-template-rows:minmax(0,1fr) 42px!important;overflow:hidden!important}
        .library-page .library-thumb,.library-page .video-thumb,.library-page .np-library-pending-preview{width:100%!important;height:auto!important;min-height:0!important;min-width:0!important;flex:0 0 auto!important;aspect-ratio:9/12!important;border-radius:9px 9px 0 0!important}
        .library-page .library-thumb video,.library-page .library-thumb img,.library-page .video-thumb video,.library-page .video-thumb img,.library-page .np-library-pending-preview video{width:100%!important;height:100%!important;object-fit:cover!important;border-radius:9px 9px 0 0!important}
        .library-page .library-thumb:before,.library-page .video-thumb:before{left:5px!important;top:5px!important;height:15px!important;padding:0 6px!important;font-size:7px!important;line-height:15px!important}
        .library-page .library-thumb:after,.library-page .video-thumb:after{width:30px!important;height:30px!important;box-shadow:0 0 0 5px rgba(0,0,0,.36)!important}
        .library-page .np-library-play-triangle{border-top-width:6px!important;border-bottom-width:6px!important;border-left-width:9px!important}
        .library-page .library-info,.library-page .video-info,.library-page .np-library-card-body{min-width:0!important;min-height:0!important;padding:6px 6px 7px!important;gap:2px!important;border-top:1px solid rgba(241,181,47,.26)!important;background:#07090d!important;display:block!important}
        .library-page .library-info strong,.library-page .video-info strong,.library-page .np-library-card-body strong{display:block!important;width:100%!important;color:#fff!important;font-size:9.5px!important;font-weight:900!important;line-height:1.18!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page .np-library-meta-grid,.library-page .np-library-meta-box,.library-page .np-library-card-body small,.library-page .np-library-progress{display:none!important}
        .library-page .np-library-kebab{display:none!important}
        .library-page .np-library-play-button{height:18px!important;min-height:18px!important;margin:4px 0 0!important;border-radius:6px!important;font-size:8.5px!important;line-height:1!important;padding:0!important}
        .library-page .library-card>.icon-button.danger,.library-page .video-card>.icon-button.danger,.library-page .np-library-pending-card .np-library-cancel-upload{right:5px!important;top:5px!important;width:22px!important;height:22px!important;border-radius:7px!important;font-size:14px!important}
        .library-page .np-library-uploading{left:5px!important;top:5px!important;max-width:62px!important;padding:3px 5px!important;font-size:7px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .accounts-bar{width:100%!important;margin:12px 0 12px!important;padding:0 12px 8px!important;display:flex!important;gap:8px!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:thin!important}
        .accounts-bar .account-chip,.accounts-bar .account-add{flex:0 0 164px!important;width:164px!important;min-width:164px!important;height:58px!important;min-height:58px!important;border-radius:13px!important;padding:0!important}
        .accounts-bar .account-chip-main{width:100%!important;height:100%!important;padding:9px 10px!important;display:grid!important;grid-template-columns:14px minmax(0,1fr)!important;gap:8px!important;align-items:center!important;text-align:left!important}
        .accounts-bar .account-chip-text{min-width:0!important;display:grid!important;gap:2px!important}
        .accounts-bar .account-chip strong{font-size:11.5px!important;line-height:1.12!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .accounts-bar .account-chip small{font-size:8.5px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .accounts-bar .account-add{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;font-size:12px!important;font-weight:900!important}
        .wizard-area{position:relative!important;z-index:1!important;width:100%!important;max-width:none!important;min-height:auto!important;padding:18px 12px 146px!important;overflow:visible!important}
        .stepper{width:100%!important;max-width:none!important;margin:0 0 18px!important;padding:0 4px 6px!important;display:flex!important;overflow-x:auto!important;overflow-y:hidden!important;scrollbar-width:none!important}
        .stepper::-webkit-scrollbar{display:none!important}
        .step-wrap{flex:0 0 86px!important;min-width:86px!important}
        .step-wrap:last-child{flex:0 0 74px!important;min-width:74px!important}
        .step{width:74px!important;gap:6px!important}
        .step-number{width:32px!important;height:32px!important;font-size:12px!important}
        .step-label{max-width:74px!important;font-size:9px!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;text-align:center!important}
        .step-line{min-width:32px!important;margin:15px 6px 0!important}
        .step-content{width:100%!important;max-width:none!important;margin:0!important;min-width:0!important;overflow:visible!important}
        .step-content>.card{width:100%!important;max-width:none!important;min-width:0!important;margin:0 auto!important;padding:22px 22px!important;border-radius:16px!important;overflow:hidden!important}
        .step-content>.card .card-heading{display:grid!important;grid-template-columns:1fr!important;gap:10px!important;margin-bottom:18px!important}
        .step-content>.card .card-heading h2{font-size:24px!important;line-height:1.16!important;letter-spacing:0!important;word-break:normal!important}
        .step-content>.card .card-heading p{font-size:12px!important;line-height:1.55!important;max-width:100%!important}
        .step-content>.card .card-heading .status-pill{justify-self:start!important;min-height:34px!important;padding:8px 12px!important;font-size:11px!important}
        .step-content .field-label{font-size:11px!important;line-height:1.35!important;margin:14px 0 7px!important}
        .step-content .text-input{width:100%!important;min-height:48px!important;height:48px!important;border-radius:11px!important;font-size:13px!important}
        .step-content .tiktok-button{width:100%!important;min-height:54px!important;margin-top:16px!important;border-radius:12px!important;font-size:13px!important;justify-content:center!important}
        .step-content .connected-panel{display:grid!important;grid-template-columns:38px minmax(0,1fr)!important;gap:10px!important;padding:12px!important;margin-top:14px!important;border-radius:13px!important}
        .step-content .connected-panel .connected-actions{grid-column:1/-1!important;margin:2px 0 0!important;width:100%!important;display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}
        .step-content .connected-panel .soft-button{width:100%!important;margin:0!important;min-height:38px!important;justify-content:center!important;font-size:11px!important}
        .step-content .privacy-note,.step-content .warning-note{font-size:10.5px!important;line-height:1.45!important;padding:11px 12px!important;margin-top:14px!important;border-radius:12px!important}
        .step-content:has(.ready-grid){width:100%!important;max-width:none!important;margin:0!important;overflow:visible!important;padding-bottom:18px!important}
        .ready-grid{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;align-items:stretch!important}
        .ready-grid>.ready-hero,.ready-grid>.checklist.card{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;box-sizing:border-box!important;border-radius:16px!important;overflow:hidden!important}
        .ready-grid>.ready-hero{min-height:0!important;padding:22px 18px 18px!important;display:grid!important;grid-template-columns:54px minmax(0,1fr)!important;grid-template-areas:"icon eyebrow" "icon title" "copy copy" "error error" "button button"!important;gap:6px 13px!important;align-items:center!important;background:linear-gradient(145deg,rgba(19,35,57,.96),rgba(9,15,26,.98) 58%,rgba(20,46,45,.9))!important;border-color:rgba(245,158,11,.66)!important}
        .ready-grid>.ready-hero .ready-icon{grid-area:icon!important;width:54px!important;height:54px!important;border-radius:15px!important;margin:0!important;display:grid!important;place-items:center!important;box-shadow:0 12px 24px rgba(47,140,255,.22)!important}
        .ready-grid>.ready-hero .ready-icon svg{width:27px!important;height:27px!important}
        .ready-grid>.ready-hero .eyebrow{grid-area:eyebrow!important;margin:0!important;font-size:10px!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .ready-grid>.ready-hero h2{grid-area:title!important;margin:0!important;font-size:25px!important;line-height:1.08!important;letter-spacing:0!important;word-break:normal!important;overflow-wrap:normal!important}
        .ready-grid>.ready-hero p{grid-area:copy!important;margin:8px 0 0!important;max-width:none!important;font-size:11.5px!important;line-height:1.52!important;color:#c9d6e8!important;word-break:normal!important;overflow-wrap:break-word!important}
        .ready-grid>.ready-hero .error-banner{grid-area:error!important;margin:8px 0 0!important;font-size:10.5px!important;line-height:1.4!important;padding:10px 11px!important;border-radius:11px!important}
        .ready-grid>.ready-hero .primary-button.large{grid-area:button!important;width:100%!important;min-height:48px!important;margin:12px 0 0!important;border-radius:12px!important;font-size:13px!important;line-height:1.15!important;justify-content:center!important}
        .ready-grid>.checklist.card{padding:18px!important;background:linear-gradient(180deg,rgba(16,25,40,.97),rgba(9,15,26,.98))!important;border-color:rgba(126,164,218,.24)!important}
        .ready-grid>.checklist.card h3{margin:0 0 12px!important;font-size:18px!important;line-height:1.2!important;letter-spacing:0!important}
        .ready-grid>.checklist.card>div{display:grid!important;grid-template-columns:26px minmax(0,1fr) 18px!important;gap:10px!important;align-items:center!important;min-height:52px!important;padding:10px 0!important;border-bottom:1px solid rgba(126,164,218,.14)!important}
        .ready-grid>.checklist.card>div:last-child{border-bottom:0!important}
        .ready-grid>.checklist.card>div>svg:first-child{width:21px!important;height:21px!important;color:#9fb0c6!important}
        .ready-grid>.checklist.card span{min-width:0!important;display:grid!important;gap:3px!important;color:#93a4bb!important;font-size:10px!important;line-height:1.15!important}
        .ready-grid>.checklist.card strong{display:block!important;max-width:100%!important;color:#f5f8ff!important;font-size:12px!important;line-height:1.28!important;white-space:normal!important;overflow-wrap:anywhere!important}
        .ready-grid>.checklist.card .check{width:16px!important;height:16px!important;color:#22c55e!important}
        .np-live-video-card-patched{display:grid!important;grid-template-columns:118px minmax(0,1fr)!important;grid-template-areas:"head head" "main queue" "schedule schedule"!important;gap:12px!important;width:100%!important;max-width:none!important;min-width:0!important;padding:20px 14px 18px!important;overflow:hidden!important}
        .np-live-video-card-patched>.card-heading{display:block!important;margin:0 0 18px!important;padding:0 4px!important}
        .np-live-video-card-patched>.card-heading h2{font-size:24px!important;line-height:1.18!important;max-width:100%!important}
        .np-live-video-card-patched>.card-heading p{font-size:11.5px!important;line-height:1.45!important}
        .np-live-main-video{grid-area:main!important;display:grid!important;gap:8px!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;align-content:start!important}
        .np-live-main-video .np-live-main-frame{width:100%!important;min-height:0!important;height:210px!important;aspect-ratio:9/16!important;padding:8px!important;border-radius:14px!important}
        .np-live-main-video .np-live-main-frame:not(.is-empty){min-height:0!important;height:210px!important}
        .np-live-main-video .np-live-main-frame.is-empty{height:260px!important}
        .np-live-main-video .np-live-main-empty{width:100%!important;display:grid!important;place-items:center!important;text-align:center!important;gap:9px!important;padding:8px!important}
        .np-live-main-video .np-live-main-empty-title{font-size:15px!important;line-height:1.25!important;max-width:210px!important}
        .np-live-main-video .np-live-main-empty-help{font-size:11px!important;line-height:1.45!important;max-width:220px!important}
        .np-live-main-video .np-live-main-empty-pill{max-width:220px!important;font-size:10.5px!important;line-height:1.2!important;padding:8px 11px!important;border-radius:999px!important}
        .np-live-main-video video{width:100%!important;height:100%!important;min-height:0!important;object-fit:cover!important;border-radius:11px!important}
        .np-live-main-video .np-live-main-delete{right:7px!important;top:7px!important;width:28px!important;height:28px!important;border-radius:8px!important}
        .np-live-main-video .np-live-queue-pick{width:100%!important;min-height:34px!important;margin-top:0!important;padding:7px 8px!important;font-size:10px!important;line-height:1.15!important;border-radius:9px!important}
        .np-live-video-card-patched>.np-live-video-queue{grid-area:queue!important;position:static!important;display:block!important;width:100%!important;max-width:none!important;min-width:0!important;min-height:120px!important;margin:0!important;padding:12px!important;border-radius:14px!important;overflow:hidden!important}
        .np-live-video-queue .card-heading{display:grid!important;grid-template-columns:1fr!important;align-items:start!important;justify-content:start!important;gap:8px!important;margin:0 0 10px!important}
        .np-live-video-queue .card-heading h2{font-size:20px!important;line-height:1.15!important;margin:0!important;white-space:normal!important;word-break:normal!important}
        .np-live-queue-head-actions{display:flex!important;align-items:center!important;gap:6px!important;min-width:0!important;flex-wrap:wrap!important}
        .np-live-queue-count{max-width:100%!important;padding:5px 8px!important;font-size:8.5px!important;line-height:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .np-live-queue-head-actions .ghost-button{min-height:30px!important;padding:6px 8px!important;font-size:9.5px!important;white-space:nowrap!important}
        .np-live-video-queue .np-live-queue-grid{display:block!important;width:100%!important;min-width:0!important;overflow:hidden!important}
        .np-live-video-queue .np-live-queue-table{display:grid!important;gap:8px!important;width:100%!important;min-width:0!important}
        .np-live-video-queue .np-live-queue-item{width:100%!important;min-width:0!important;display:grid!important;grid-template-columns:54px minmax(0,1fr) auto!important;gap:8px!important;align-items:center!important;padding:8px!important;border-radius:12px!important}
        .np-live-video-queue .np-live-queue-item video{width:54px!important;height:78px!important;border-radius:9px!important}
        .np-live-video-queue .np-live-queue-item strong{font-size:11px!important;line-height:1.25!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .np-live-video-queue .np-live-queue-item small{font-size:9px!important;line-height:1.2!important}
        .np-live-video-queue .np-live-queue-cell{grid-column:1/-1!important;display:grid!important;grid-template-columns:92px minmax(0,1fr)!important;gap:8px!important;align-items:center!important}
        .np-live-video-queue .np-live-queue-cell span{font-size:9px!important}
        .np-live-video-queue .np-live-queue-cell input{height:34px!important;min-height:34px!important;font-size:11px!important}
        .np-live-video-queue .np-live-queue-actions{grid-column:1/-1!important;display:flex!important;justify-content:flex-end!important;gap:6px!important}
        .np-live-video-card-patched>.np-live-schedule-card{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;width:100%!important;max-width:none!important;min-width:0!important;margin:14px 0 0!important;padding:14px!important;border-radius:14px!important}
        .np-live-video-card-patched>.np-live-schedule-card .card-heading h2{font-size:15px!important;white-space:normal!important}
        .np-live-video-card-patched>.np-live-schedule-card .np-live-schedule-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
        .np-live-video-card-patched>.np-live-schedule-card .np-live-number span,.np-live-video-card-patched>.np-live-schedule-card .np-live-status span{font-size:8.5px!important;line-height:1.2!important}
        .np-live-video-card-patched>.np-live-schedule-card .np-live-number input,.np-live-video-card-patched>.np-live-schedule-card .np-live-status strong{height:36px!important;min-height:36px!important;font-size:11px!important;border-radius:9px!important;padding:0 9px!important}
        .np-live-video-card-patched>.dropzone{display:none!important;visibility:hidden!important;width:0!important;height:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;pointer-events:none!important}
        .np-live-video-card-patched:has(.np-live-main-frame.is-empty){display:block!important}
        .np-live-video-card-patched:has(.np-live-main-frame.is-empty)>.np-live-video-queue{margin:12px 0 0!important}
        .np-live-picker-backdrop{align-items:start!important;place-items:start center!important;padding:62px 10px 78px!important;background:rgba(1,5,12,.66)!important}
        .np-live-picker{width:100%!important;max-width:370px!important;max-height:calc(100dvh - 150px)!important;padding:14px!important;border-radius:16px!important;overflow:hidden!important}
        .np-live-picker-head{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px 10px!important;align-items:start!important;margin-bottom:12px!important}
        .np-live-picker-head h2{font-size:20px!important;line-height:1.18!important;margin:0!important}
        .np-live-picker-head p{font-size:10.5px!important;line-height:1.35!important;margin:5px 0 0!important}
        .np-live-picker-head-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;min-width:0!important}
        .np-live-picker-count{margin:0!important;font-size:10.5px!important;line-height:1!important;max-width:110px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .np-live-picker-close{min-height:30px!important;padding:6px 8px!important;border:1px solid rgba(126,164,218,.28)!important;border-radius:999px!important;background:rgba(16,28,45,.88)!important;font-size:10.5px!important;line-height:1!important}
        .np-live-picker-list{max-height:calc(100dvh - 252px)!important;padding:0 4px 4px 0!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important;justify-content:stretch!important;overflow:auto!important}
        .np-live-picker-list::-webkit-scrollbar{width:4px!important}
        .np-live-picker-card{min-width:0!important;padding:6px!important;border-radius:12px!important;gap:6px!important}
        .np-live-picker-preview{aspect-ratio:9/13!important;border-radius:10px!important}
        .np-live-picker-preview video{object-fit:cover!important}
        .np-live-picker-ready{left:6px!important;top:6px!important;padding:3px 6px!important;font-size:7.5px!important}
        .np-live-picker-title{padding:6px!important;border-radius:9px!important;gap:2px!important;background:rgba(8,12,20,.72)!important}
        .np-live-picker-title strong{font-size:10.5px!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .np-live-picker-title small{font-size:8px!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .np-live-picker-meta{display:block!important}
        .np-live-picker-meta>div:not(.np-live-picker-select){display:none!important}
        .np-live-picker-select{display:none!important}
        .np-live-picker-select-button{width:100%!important;height:32px!important;min-height:32px!important;border-radius:9px!important;font-size:10.5px!important;line-height:1!important}
        .step-content:has(.overlay-layout){width:100%!important;max-width:none!important;margin:0!important;overflow:visible!important}
        .overlay-layout{display:grid!important;grid-template-columns:1fr!important;gap:12px!important;width:100%!important;max-width:none!important;min-width:0!important}
        .overlay-layout>.preview-card,.overlay-layout>.overlay-controls{width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;border-radius:15px!important}
        .overlay-layout>.preview-card{padding:12px!important;overflow:hidden!important}
        .preview-title{padding:0 2px 8px!important}
        .preview-title span{font-size:11px!important;line-height:1.15!important}
        .preview-title small{font-size:8px!important;line-height:1.15!important}
        .portrait-stage{width:min(100%,calc((100vh - 270px) * .5625))!important;width:min(100%,calc((100dvh - 270px) * .5625))!important;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:9/16!important;margin:0 auto!important;border-radius:13px!important;overflow:hidden!important}
        .portrait-stage>video{width:100%!important;height:100%!important;object-fit:cover!important}
        .overlay-controls{min-height:0!important;padding:14px!important;overflow:hidden!important}
        .overlay-controls .card-heading{display:block!important;margin:0 0 12px!important}
        .overlay-controls .card-heading h2{font-size:19px!important;line-height:1.18!important;margin:0 0 5px!important}
        .overlay-controls .card-heading p{font-size:10.5px!important;line-height:1.4!important;margin:0!important}
        .overlay-controls .camera-panel{padding:11px!important;margin:0 0 12px!important;border-radius:12px!important}
        .overlay-controls .camera-panel-head{margin:0 0 8px!important}
        .overlay-controls .camera-panel-head>span{font-size:11px!important;line-height:1.2!important}
        .overlay-controls .camera-zoom-row{gap:8px!important;margin:0 0 8px!important}
        .overlay-controls .camera-mirror-btn{height:36px!important;min-height:36px!important;font-size:11px!important;border-radius:10px!important}
        .overlay-controls .overlay-actions{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}
        .overlay-controls .overlay-actions .outline-button{height:38px!important;min-height:38px!important;padding:7px!important;font-size:10.5px!important;line-height:1.1!important;border-radius:10px!important}
        .overlay-controls .overlay-list{max-height:260px!important;margin-top:12px!important;gap:8px!important;overflow:auto!important}
        .overlay-controls .overlay-item{padding:8px!important;border-radius:11px!important;gap:8px!important}
        .overlay-controls .overlay-item>img,.overlay-controls .clock-thumbnail{width:44px!important;height:44px!important;flex:0 0 44px!important;border-radius:9px!important}
        .overlay-controls .overlay-item-main strong{font-size:10.5px!important;line-height:1.2!important}
        .overlay-controls .overlay-item-main small{font-size:8.5px!important;line-height:1.25!important;max-width:150px!important}
        .overlay-controls .overlay-item-main label{font-size:9px!important}
        .overlay-controls select,.overlay-controls input{min-height:36px!important;height:36px!important;font-size:11px!important;border-radius:9px!important}
        .overlay-controls .empty-overlays{padding:12px!important;font-size:10px!important;line-height:1.35!important;border-radius:10px!important}
      }
      .toggle.on{background:linear-gradient(135deg,#fbbf24,#f59e0b)!important}
      .text-input:focus,input:focus,textarea:focus,select:focus{border-color:rgba(245,158,11,.88)!important;box-shadow:0 0 0 3px rgba(245,158,11,.16)!important}
      .step.active .step-number{background:linear-gradient(135deg,#fbbf24,#f59e0b)!important;color:#111827!important;box-shadow:none!important}
      .accounts-bar .account-chip.active{border-color:#f59e0b!important;background:linear-gradient(135deg,rgba(245,158,11,.16),rgba(10,17,29,.96))!important;box-shadow:0 0 0 1px rgba(245,158,11,.5)!important}
      .eyebrow,.np-src-kicker,.np-package-kicker{color:#8fb8ff!important;letter-spacing:0!important;text-transform:none!important}
      .sidebar-bottom{display:grid!important;gap:8px!important;padding-top:12px!important;margin-top:auto!important}
      .system-state{min-height:42px!important;padding:9px 12px!important;display:grid!important;grid-template-columns:10px 1fr!important;gap:9px!important;align-items:center!important;border-radius:11px!important;background:rgba(8,21,36,.82)!important}
      .system-state .status-dot{width:9px!important;height:9px!important;margin:0!important}
      .system-state small{display:none!important}
      .system-state strong{font-size:12px!important;line-height:1.2!important}
      .sidebar-bottom .system-state,.sidebar-bottom .license-chip{display:none!important}
      .sidebar-bottom>button,.license-signout,.license-chip{min-height:40px!important;padding:8px 12px!important;border-radius:11px!important;background:#071625!important}
      .sidebar-bottom>button svg,.license-signout svg{width:18px!important;height:18px!important}
      .license-chip{display:grid!important;grid-template-columns:18px minmax(0,1fr)!important;gap:8px!important;align-items:center!important}
      .license-chip strong,.license-chip span{font-size:12px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .sidebar-bottom .app-version{font-size:10px!important;color:#7f91aa!important;text-align:center!important;margin:4px 0 0!important}
      .settings-page.np-settings-clean{max-width:1180px!important;margin:0 auto!important;padding:28px 28px 92px!important}
      .settings-page.np-settings-clean .page-intro,.settings-page.np-settings-line .page-intro{border-bottom:1px solid rgba(126,164,218,.18)!important;padding:0 0 18px!important;margin:0 0 24px!important;background:transparent!important;display:block!important}
      .settings-page.np-settings-clean .page-intro>div,.settings-page.np-settings-line .page-intro>div{display:block!important}
      .settings-page.np-settings-clean .page-intro h1,.settings-page.np-settings-line .page-intro h1{font-size:28px!important;line-height:1.18!important;margin:0!important;text-align:left!important}
      .settings-page.np-settings-clean .page-intro p,.settings-page.np-settings-line .page-intro p{display:block!important;margin:7px 0 0!important;font-size:12px!important;line-height:1.5!important;color:#aebdd3!important;text-align:left!important}
      .settings-page.np-settings-clean .page-intro .eyebrow,.settings-page.np-settings-line .page-intro .eyebrow{display:none!important}
      .settings-page.np-settings-clean .card{padding:18px 20px!important;border-radius:14px!important;box-shadow:none!important}
      .settings-page.np-settings-clean .card+.card{margin-top:14px!important}
      .settings-page.np-settings-clean .card-heading,.settings-page.np-settings-clean .panel-heading{margin-bottom:12px!important}
      .settings-page.np-settings-clean h1{font-size:28px!important}
      .settings-page.np-settings-clean h2{font-size:20px!important;margin-bottom:4px!important}
      .settings-page.np-settings-clean p{font-size:12px!important;line-height:1.5!important;color:#aebdd3!important}
      .settings-page.np-settings-clean select,.settings-page.np-settings-clean input{min-height:40px!important}
      .settings-page.np-settings-clean .settings-grid,.settings-page.np-settings-clean .settings-section,.settings-page.np-settings-clean .form-grid{gap:12px!important}
      .settings-page.np-settings-clean .card:has(select){display:grid!important;grid-template-columns:1fr auto!important;gap:14px!important;align-items:start!important}
      .settings-page.np-settings-clean .card:has(select)>*:not(.card-heading):not(.panel-heading){grid-column:1/-1!important}
      .settings-page.np-settings-clean .ghost-button,.settings-page.np-settings-clean .outline-button,.settings-page.np-settings-clean .primary-button{min-height:38px!important;padding:8px 12px!important}
      .settings-page.np-settings-clean .success-banner,.settings-page.np-settings-clean .notice,.settings-page.np-settings-clean .status-line{min-height:38px!important;padding:10px 12px!important;border-radius:10px!important}
      .settings-page.np-settings-line{max-width:1180px!important;margin:0 auto!important;padding:28px 28px 92px!important}
      .settings-page.np-settings-line .chat-settings-card{max-width:none!important;width:100%!important;padding:18px 20px!important;border-radius:14px!important;box-shadow:none!important}
      .settings-page.np-settings-line .chat-settings-card .card-heading{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:18px!important;align-items:start!important;margin-bottom:18px!important;padding-bottom:18px!important;border-bottom:1px solid rgba(126,164,218,.18)!important}
      .settings-page.np-settings-line .chat-settings-card .card-heading h2{font-size:20px!important;line-height:1.25!important;margin:0 0 4px!important}
      .settings-page.np-settings-line .chat-settings-card .card-heading p{font-size:12px!important;line-height:1.5!important;color:#aebdd3!important}
      .settings-page.np-settings-line .chat-settings-card .toggle{justify-self:end!important;margin-top:0!important}
      .settings-page.np-settings-line .chat-settings-card .chat-section{display:grid!important;gap:10px!important;margin-top:14px!important;padding-top:0!important}
      .settings-page.np-settings-line .chat-settings-card .field-label,.settings-page.np-settings-line .chat-settings-card label{font-size:12px!important;font-weight:850!important;color:#dce8f8!important}
      .settings-page.np-settings-line .chat-settings-card .text-input,.settings-page.np-settings-line .chat-settings-card input{min-height:40px!important;font-size:12.5px!important;border-radius:10px!important}
      .settings-page.np-settings-line .chat-settings-card .privacy-note{min-height:40px!important;padding:10px 12px!important;border-radius:10px!important;font-size:11.5px!important;line-height:1.45!important}
      .settings-page.np-settings-line .chat-settings-card .option-row{min-height:62px!important;padding:11px 14px!important;border-radius:12px!important;background:rgba(18,28,44,.7)!important}
      .settings-page.np-settings-line .chat-settings-card .option-row strong{font-size:12.5px!important}
      .settings-page.np-settings-line .chat-settings-card .option-row small{font-size:10.5px!important;line-height:1.35!important;color:#91a6c0!important}
      .settings-page.np-settings-line .chat-settings-card .settings-actions{display:flex!important;flex-wrap:wrap!important;gap:10px!important;justify-content:flex-start!important;margin-top:18px!important;padding-top:16px!important;border-top:1px solid rgba(126,164,218,.18)!important}
      .settings-page.np-settings-line .chat-settings-card .settings-actions button{min-height:38px!important;padding:8px 12px!important}
      .page-intro.np-live-account-titleless{display:none!important}
      .page-intro.np-live-account-titleless + .accounts-bar{margin-top:34px!important}
      .page-intro.np-live-account-titleless ~ .wizard-area{padding-top:42px!important}
      .page-intro.np-live-account-titleless + .accounts-bar{padding-top:2px!important;overflow-y:visible!important}
      .accounts-bar .account-chip.np-account-control-target{transform:none!important}
      .accounts-bar .account-chip.active{border-top-color:#f59e0b!important;box-shadow:inset 0 0 0 1px rgba(245,158,11,.55)!important}
      h1,h2,h3,strong{letter-spacing:0!important}
      @media(max-width:760px){
        .main-area{overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important}
        .step-content.np-live-connect-step .np-live-pin-card{height:auto!important;min-height:0!important;max-height:none!important;display:block!important;overflow:visible!important}
        .step-content.np-live-connect-step .np-live-pin-card .pin-list{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;display:grid!important;flex:none!important}
        .step-content.np-live-connect-step .np-live-pin-card .pin-ai-details{max-height:none!important;overflow:visible!important}
      }
      @media(max-width:760px){
        .library-page .library-card,.library-page .video-card,.library-page .np-library-pending-card,
        body.np-mobile-nav-ready .library-page .library-card,body.np-mobile-nav-ready .library-page .video-card,body.np-mobile-nav-ready .library-page .np-library-pending-card{aspect-ratio:9/22!important;grid-template-rows:minmax(0,1fr) 124px!important}
        .library-page .library-info,.library-page .video-info,.library-page .np-library-card-body,
        body.np-mobile-nav-ready .library-page .library-info,body.np-mobile-nav-ready .library-page .video-info,body.np-mobile-nav-ready .library-page .np-library-card-body{display:grid!important;grid-template-rows:auto minmax(0,1fr) 17px!important;gap:4px!important;min-height:0!important;padding:6px 5px 6px!important;overflow:hidden!important}
        .library-page .library-info strong,.library-page .video-info strong,.library-page .np-library-card-body strong,
        body.np-mobile-nav-ready .library-page .library-info strong,body.np-mobile-nav-ready .library-page .video-info strong,body.np-mobile-nav-ready .library-page .np-library-card-body strong{font-size:9px!important;line-height:1.15!important}
        .library-page .np-library-meta-grid,body.np-mobile-nav-ready .library-page .np-library-meta-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:4px!important;min-width:0!important;min-height:0!important}
        .library-page .np-library-meta-box,body.np-mobile-nav-ready .library-page .np-library-meta-box{display:grid!important;align-content:center!important;gap:2px!important;min-width:0!important;min-height:0!important;padding:4px!important;border-radius:5px!important;overflow:hidden!important}
        .library-page .np-library-meta-box span,body.np-mobile-nav-ready .library-page .np-library-meta-box span{font-size:7px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page .np-library-meta-box b,body.np-mobile-nav-ready .library-page .np-library-meta-box b{font-size:8px!important;line-height:1.15!important;word-break:break-word!important;overflow:hidden!important}
        .library-page .np-library-kebab,body.np-mobile-nav-ready .library-page .np-library-kebab{display:none!important}
        .library-page .np-library-play-button,body.np-mobile-nav-ready .library-page .np-library-play-button{height:17px!important;min-height:17px!important;margin:0!important;font-size:7.5px!important}
        .library-page .np-library-pending-card .np-library-card-body,body.np-mobile-nav-ready .library-page .np-library-pending-card .np-library-card-body{display:grid!important;grid-template-rows:auto auto minmax(0,1fr)!important;gap:4px!important;padding:6px 5px!important;overflow:hidden!important}
        .library-page .np-library-pending-card .np-library-card-body small,body.np-mobile-nav-ready .library-page .np-library-pending-card .np-library-card-body small{display:block!important;min-width:0!important;color:#aebdd2!important;font-size:7px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page .np-library-pending-card .np-library-progress,body.np-mobile-nav-ready .library-page .np-library-pending-card .np-library-progress{display:grid!important;gap:3px!important;min-width:0!important;align-content:end!important}
        .library-page .np-library-pending-card .np-library-progress-top,body.np-mobile-nav-ready .library-page .np-library-pending-card .np-library-progress-top{font-size:7px!important;line-height:1.1!important}
        .library-page .np-library-pending-card .np-library-progress-bar,body.np-mobile-nav-ready .library-page .np-library-pending-card .np-library-progress-bar{height:4px!important}
      }
      @media(max-width:650px){
        .step-content.np-live-connect-step .np-live-pin-card{height:auto!important;min-height:0!important;padding:14px!important;overflow:visible!important}
        .step-content.np-live-connect-step .pin-list{gap:6px!important;padding-right:0!important;overflow:visible!important}
        .step-content.np-live-connect-step .pin-row{grid-template-columns:24px 34px minmax(0,1fr)!important;grid-template-rows:auto auto!important;gap:5px 6px!important;min-height:0!important;padding:7px 8px!important;align-items:start!important;overflow:hidden!important}
        .step-content.np-live-connect-step .pin-order{width:24px!important;height:24px!important;border-radius:7px!important;font-size:10px!important;grid-column:1!important;grid-row:1!important}
        .step-content.np-live-connect-step .pin-thumb{width:34px!important;height:34px!important;border-radius:8px!important;grid-column:2!important;grid-row:1!important}
        .step-content.np-live-connect-step .pin-name{grid-column:3!important;grid-row:1!important;min-width:0!important;padding-top:1px!important;overflow:hidden!important}
        .step-content.np-live-connect-step .pin-name strong{font-size:10.5px!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .step-content.np-live-connect-step .pin-name small{font-size:8.5px!important;line-height:1.2!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .step-content.np-live-connect-step .pin-actions{grid-column:3!important;grid-row:2!important;display:flex!important;flex-wrap:wrap!important;justify-content:flex-start!important;align-items:center!important;gap:4px!important;min-width:0!important;width:100%!important;overflow:hidden!important}
        .step-content.np-live-connect-step .pin-actions .ghost-button,.step-content.np-live-connect-step .pin-actions button{width:auto!important;min-width:0!important;height:26px!important;min-height:26px!important;padding:4px 6px!important;border-radius:8px!important;font-size:9px!important;line-height:1!important;white-space:nowrap!important;flex:0 0 auto!important}
        .step-content.np-live-connect-step .pin-actions .icon-button{width:26px!important;height:26px!important;padding:0!important}
        .step-content.np-live-connect-step .pin-option{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;gap:10px!important;align-items:start!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;padding:10px 0!important}
        .step-content.np-live-connect-step .pin-option>div:first-child{min-width:0!important;width:auto!important;max-width:none!important;overflow:visible!important}
        .step-content.np-live-connect-step .pin-option strong{display:block!important;max-width:none!important;font-size:11px!important;line-height:1.3!important;white-space:normal!important;word-break:normal!important;overflow-wrap:break-word!important}
        .step-content.np-live-connect-step .pin-option small{display:block!important;max-width:none!important;margin-top:4px!important;font-size:9px!important;line-height:1.45!important;white-space:normal!important;word-break:normal!important;overflow-wrap:break-word!important;color:#91a6c0!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions{grid-column:2!important;grid-row:1!important;width:auto!important;min-width:50px!important;max-width:105px!important;justify-content:flex-end!important;align-items:center!important;overflow:visible!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .pin-chip{max-width:66px!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions{gap:7px!important;padding:3px 5px 3px 7px!important;border:1px solid rgba(126,164,218,.22)!important;border-radius:999px!important;background:rgba(8,16,29,.72)!important;box-sizing:border-box!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .pin-chip{height:28px!important;min-height:28px!important;padding:5px 7px!important;border-radius:8px!important;font-size:8.5px!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .switch{position:relative!important;display:flex!important;align-items:center!important;justify-content:flex-start!important;flex:0 0 42px!important;width:42px!important;min-width:42px!important;height:24px!important;min-height:24px!important;padding:2px!important;border:1px solid rgba(126,164,218,.42)!important;border-radius:999px!important;background:#26364b!important;box-sizing:border-box!important;cursor:pointer!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .switch.on{justify-content:flex-end!important;border-color:rgba(245,158,11,.86)!important;background:linear-gradient(135deg,#fbbf24,#f59e0b)!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .switch span{display:block!important;width:18px!important;height:18px!important;min-width:18px!important;border-radius:50%!important;background:#94a3b8!important;box-shadow:0 2px 5px rgba(0,0,0,.35)!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .switch.on span{background:#101923!important}
        .step-content.np-live-connect-step .pin-option{grid-template-columns:minmax(0,1fr) 132px!important;gap:8px!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions{width:132px!important;min-width:132px!important;max-width:132px!important;flex-wrap:nowrap!important;justify-content:flex-end!important;gap:5px!important;padding:3px 4px 3px 5px!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .pin-chip{width:76px!important;max-width:76px!important;min-width:0!important;flex:0 0 76px!important;padding-left:5px!important;padding-right:5px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions .switch{flex:0 0 42px!important;width:42px!important;min-width:42px!important}
      }
      @media(max-width:650px){
        .np-library-upload-modal{width:calc(100vw - 20px)!important;max-width:420px!important;max-height:calc(100dvh - 20px)!important;padding:12px!important;overflow:auto!important}
        .np-library-upload-head{gap:8px!important;margin-bottom:10px!important}
        .np-library-upload-head span{font-size:9px!important;margin-bottom:4px!important}
        .np-library-upload-head h2{font-size:18px!important;line-height:1.15!important}
        .np-library-upload-head p{margin-top:5px!important;font-size:10px!important;line-height:1.35!important}
        .np-library-upload-close{width:32px!important;height:32px!important;flex:0 0 32px!important;font-size:19px!important}
        .np-library-upload-body{grid-template-columns:minmax(118px,38%) minmax(0,1fr)!important;gap:10px!important;align-items:start!important}
        .np-library-upload-drop{grid-column:1!important;grid-row:1!important;width:100%!important;height:auto!important;min-height:0!important;aspect-ratio:9/12!important;padding:6px!important;margin:0!important;border-radius:11px!important}
        .np-library-upload-drop video{width:100%!important;height:100%!important;object-fit:contain!important;border-radius:8px!important}
        .np-library-upload-drop .np-library-upload-empty{gap:6px!important}
        .np-library-upload-empty b{font-size:28px!important}
        .np-library-upload-empty strong{font-size:9px!important;line-height:1.15!important}
        .np-library-upload-empty small{font-size:7px!important;line-height:1.15!important}
        .np-library-upload-form{grid-column:2!important;grid-row:1!important;align-content:start!important;gap:8px!important;min-width:0!important}
        .np-library-upload-form label{gap:5px!important;font-size:10px!important;line-height:1.2!important}
        .np-library-upload-form input{height:36px!important;min-width:0!important;padding:0 9px!important;font-size:10px!important;border-radius:8px!important}
        .np-library-upload-meta{padding:9px!important;gap:5px!important;border-radius:9px!important;font-size:9px!important;line-height:1.2!important}
        .np-library-upload-meta strong{font-size:10px!important;line-height:1.2!important;overflow-wrap:anywhere!important}
        .np-library-upload-actions{gap:6px!important;margin-top:0!important}
        .np-library-upload-primary,.np-library-upload-secondary{height:34px!important;min-height:34px!important;border-radius:8px!important;font-size:10px!important;padding:0 6px!important}
        .np-library-upload-note{font-size:8px!important;line-height:1.3!important}
      }
      @media(max-width:350px){
        .np-library-upload-body{grid-template-columns:1fr!important}
        .np-library-upload-drop{grid-column:1!important;grid-row:1!important;width:min(150px,100%)!important;justify-self:center!important}
        .np-library-upload-form{grid-column:1!important;grid-row:2!important}
      }
      @media(max-width:650px){
        .library-page [data-np-storage-package]{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:6px!important;width:100%!important;margin:0 0 10px!important;padding:10px!important;border-radius:12px!important;box-sizing:border-box!important}
        .library-page [data-np-storage-package] .np-storage-plan{grid-column:1/-1!important;min-height:40px!important;padding:0!important;border:0!important;display:flex!important;gap:8px!important;align-items:center!important}
        .library-page [data-np-storage-package] .np-storage-icon{width:30px!important;height:30px!important;min-width:30px!important;border-radius:9px!important;font-size:13px!important}
        .library-page [data-np-storage-package] .np-storage-kicker{font-size:8px!important;line-height:1.1!important}
        .library-page [data-np-storage-package] .np-storage-title{margin-top:2px!important;font-size:15px!important;line-height:1.05!important}
        .library-page [data-np-storage-package] .np-storage-sub{margin-top:2px!important;font-size:8px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page [data-np-storage-package] .np-storage-metric{min-width:0!important;min-height:42px!important;padding:6px 7px!important;border:1px solid rgba(126,164,218,.18)!important;border-radius:8px!important;background:rgba(8,17,30,.42)!important;display:grid!important;align-content:center!important;gap:3px!important}
        .library-page [data-np-storage-package] .np-storage-metric span{font-size:8px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page [data-np-storage-package] .np-storage-metric strong{font-size:15px!important;line-height:1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .library-page [data-np-storage-package] .np-storage-meter{grid-column:1/-1!important;min-width:0!important;padding:5px 0 0!important;border:0!important;display:block!important}
        .library-page [data-np-storage-package] .np-storage-meter-top{gap:8px!important;margin-bottom:5px!important}
        .library-page [data-np-storage-package] .np-storage-meter strong{font-size:9px!important;line-height:1.1!important}
        .library-page [data-np-storage-package] .np-storage-meter small,.library-page [data-np-storage-package] .np-storage-meter-right{font-size:8px!important;line-height:1.1!important}
        .library-page [data-np-storage-package] .np-storage-bar{height:5px!important}
        .library-page [data-np-storage-package] .np-storage-foot{margin-top:4px!important;font-size:8px!important;line-height:1.1!important}
      }
      @media(max-width:650px){
        .settings-page:has(.history-list){max-width:none!important;margin:0!important;padding:14px 10px 108px!important}
        .settings-page:has(.history-list) .page-intro{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:8px!important;padding:0 0 12px!important;margin:0!important}
        .settings-page:has(.history-list) .page-intro h1{min-width:0!important;font-size:22px!important;line-height:1.12!important;white-space:normal!important}
        .settings-page:has(.history-list) .page-intro .ghost-button{width:82px!important;min-width:82px!important;min-height:36px!important;height:36px!important;padding:6px 7px!important;border-radius:9px!important;font-size:10px!important;white-space:nowrap!important}
        .history-summary.card{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important;padding:8px!important;margin:0 0 10px!important;border-radius:12px!important}
        .history-summary.card>div{min-height:56px!important;padding:9px 10px!important;border-radius:9px!important;gap:7px!important}
        .history-summary.card svg{width:17px!important;height:17px!important}
        .history-summary.card small{font-size:8px!important;line-height:1.15!important;margin-bottom:2px!important}
        .history-summary.card strong{font-size:17px!important;line-height:1!important}
        .history-list{gap:7px!important}
        .history-item.card{grid-template-columns:34px minmax(0,1fr) auto!important;gap:8px!important;padding:9px 10px!important;border-radius:11px!important}
        .history-status{width:32px!important;height:32px!important;border-radius:9px!important}
        .history-main{gap:3px!important;min-width:0!important}
        .history-main strong{font-size:11.5px!important;line-height:1.15!important}
        .history-main small,.history-tech,.history-error{font-size:8.5px!important;line-height:1.2!important}
        .history-meta{grid-column:auto!important;grid-row:1!important;display:grid!important;justify-items:end!important;gap:4px!important;align-content:center!important}
        .history-duration{font-size:12px!important}
        .history-badge{min-height:20px!important;padding:4px 6px!important;font-size:8px!important}
        .history-item.card{grid-template-columns:34px minmax(0,1fr)!important;grid-template-rows:auto auto!important;align-items:start!important}
        .history-status{grid-column:1!important;grid-row:1 / span 2!important}
        .history-main{grid-column:2!important;grid-row:1!important;width:100%!important}
        .history-meta{grid-column:2!important;grid-row:2!important;width:100%!important;display:flex!important;flex-direction:row!important;flex-wrap:nowrap!important;align-items:center!important;justify-content:flex-end!important;justify-items:initial!important;gap:8px!important;margin-top:2px!important}
        .history-meta .history-duration,.history-meta .history-badge{display:inline-flex!important;flex:0 0 auto!important;margin:0!important;white-space:nowrap!important}
      }
      @media(max-width:370px){
        .step-content.np-live-connect-step .pin-option{grid-template-columns:minmax(0,1fr)!important;gap:6px!important}
        .step-content.np-live-connect-step .pin-option>.pin-actions{grid-column:1!important;grid-row:2!important;width:max-content!important;min-width:0!important;max-width:none!important;margin-left:auto!important}
      }
    `;
    document.head.append(style);
  }

  function getAccounts() {
    try {
      const accounts = JSON.parse(localStorage.getItem('rerun.accounts') || '[]');
      return Array.isArray(accounts) ? accounts : [];
    } catch {
      return [];
    }
  }

  function currentAccountId() {
    const accounts = getAccounts();
    const chips = Array.from(document.querySelectorAll('.accounts-bar .account-chip'));
    const activeIndex = Math.max(0, chips.findIndex((chip) => chip.classList.contains('active')));
    return accounts[activeIndex]?.id || accounts[0]?.id || 'main';
  }

  function accountSetupLabel(account) {
    const state = String(account?.status?.state || '').toLowerCase();
    if (state === 'live') return 'กำลังไลฟ์';
    if (state === 'starting') return 'กำลังเริ่มไลฟ์';
    if (state === 'stopping') return 'หยุดไลฟ์แล้ว';
    if (state === 'error') return 'มีข้อผิดพลาด';
    if (!account?.connected) return 'ยังไม่เชื่อมต่อ';
    const videos = Array.isArray(account.videoList) ? account.videoList.filter((video) => video?.path) : [];
    if (!videos.length) return 'ยังไม่ได้เลือกวิดีโอ';
    const step = Number(account.step || 1);
    if (step < 5) return 'กำลังตั้งค่า';
    const targetMode = account.targetMode || 'tiktok';
    const hasTarget = targetMode === 'tiktok'
      ? Boolean(String(account.liveTitle || '').trim())
      : /^rtmps?:\/\//i.test(String(account.server || '').trim()) && Boolean(String(account.streamKey || '').trim());
    if (!hasTarget) return 'ยังไม่ครบข้อมูลไลฟ์';
    return 'พร้อมไลฟ์';
  }

  function markActiveAccountControl() {
    const accounts = getAccounts();
    const chips = Array.from(document.querySelectorAll('.accounts-bar .account-chip'));
    chips.forEach((chip, index) => {
      chip.style.removeProperty('--np-account-accent');
      chip.classList.toggle('np-account-control-target', chip.classList.contains('active'));
      const account = accounts[index];
      const label = accountSetupLabel(account);
      const small = chip.querySelector('small');
      if (small && small.textContent !== label) small.textContent = label;
      const strong = chip.querySelector('strong');
      const liveTitle = String(account?.liveTitle || '').trim();
      const rawAlias = String(account?.alias || '').trim();
      const accountName = rawAlias && rawAlias !== liveTitle
        ? rawAlias
        : String(account?.accountName || account?.displayName || account?.id || 'บัญชีใหม่').trim();
      if (strong && accountName && strong.textContent !== accountName) strong.textContent = accountName;
      const name = (strong?.textContent || '').trim();
      chip.title = chip.classList.contains('active')
        ? `ช่องที่เลือก: ${name} · ${label}`
        : `เลือกช่อง: ${name} · ${label}`;
    });
  }

  function writeAccounts(accounts) {
    const serialized = JSON.stringify(accounts);
    localStorage.setItem('rerun.accounts', serialized);
    window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: serialized }));
  }

  const LIVE_UI_PREVIEW_KEY = 'np.live.ui.preview.step6';

  function clearLiveUiPreviewStep() {
    try { sessionStorage.removeItem(LIVE_UI_PREVIEW_KEY); } catch {}
    document.body?.classList.remove('np-live-ui-preview-active', 'np-live-preview-blank');
  }

  function isLiveStepButton(button) {
    if (!button) return false;
    const text = (button.textContent || '').replace(/\s+/g, '');
    return text.includes('6') && text.includes('กำลังไลฟ์');
  }

  function setCurrentAccountStep(step, maxStep = step) {
    const accounts = getAccounts();
    if (!accounts.length) return;
    const accountId = currentAccountId();
    let changed = false;
    const nextAccounts = accounts.map((account) => {
      if (account.id !== accountId) return account;
      const currentStep = Number(account.step || 1);
      const currentMaxStep = Number(account.maxStep || 1);
      const nextMaxStep = Math.max(currentMaxStep, maxStep);
      if (currentStep === step && currentMaxStep === nextMaxStep) return account;
      changed = true;
      return { ...account, step, maxStep: nextMaxStep };
    });
    if (changed) writeAccounts(nextAccounts);
  }

  function enableLiveUiPreviewStep() {
    clearLiveUiPreviewStep();
  }

  function previewLiveStatus(status = {}) {
    return {
      ...status,
      state: 'idle',
      message: status.message || 'UI preview',
      startedAt: undefined,
    };
  }

  function isLiveUiPreviewActive() {
    clearLiveUiPreviewStep();
    return false;
  }

  function installLiveUiPreviewStatusBridge() {
    clearLiveUiPreviewStep();
    return;
    if (window.__npLiveUiPreviewStatusBridge) return;
    window.__npLiveUiPreviewStatusBridge = true;
    const patchRerun = () => {
      if (!window.rerun || window.rerun.__npLiveUiPreviewPatched) return;
      const originalGetStreamStatus = window.rerun.getStreamStatus?.bind(window.rerun);
      const originalOnStreamStatus = window.rerun.onStreamStatus?.bind(window.rerun);
      if (originalGetStreamStatus) {
        window.rerun.getStreamStatus = async (...args) => {
          const status = await originalGetStreamStatus(...args);
          return isLiveUiPreviewActive() ? previewLiveStatus(status) : status;
        };
      }
      if (originalOnStreamStatus) {
        window.rerun.onStreamStatus = (callback) => originalOnStreamStatus((event) => {
          if (!isLiveUiPreviewActive()) return callback(event);
          if (event && typeof event === 'object' && 'status' in event) {
            return callback({ ...event, status: previewLiveStatus(event.status) });
          }
          return callback(previewLiveStatus(event));
        });
      }
      window.rerun.__npLiveUiPreviewPatched = true;
    };
    patchRerun();
    window.setInterval(patchRerun, 300);
  }

  function patchLiveUiPreviewCopy() {
    document.body?.classList.toggle('np-live-ui-preview-active', isLiveUiPreviewActive());
    const liveText = stepHost()?.textContent || '';
    const shouldBlankPreview = isLiveRunningStep()
      && liveText.includes('พร้อมเริ่มไลฟ์')
      && !liveText.includes('กำลังไลฟ์อยู่');
    document.body?.classList.toggle('np-live-preview-blank', shouldBlankPreview);
    if (!isLiveUiPreviewActive()) return;
    const replacements = [
      [/^กำลังเริ่มไลฟ์$/i, 'พร้อมเริ่มไลฟ์'],
      [/^กำลังไลฟ์อยู่$/i, 'พร้อมเริ่มไลฟ์'],
      [/^กำลังเชื่อมต่อ\s*RTMP\.{0,3}$/i, 'พร้อมเริ่ม'],
      [/^กำลังเชื่อมต่อ\s*RTMP…$/i, 'พร้อมเริ่ม'],
      [/^กำลังเชื่อมต่อ$/i, 'พร้อมเริ่ม'],
      [/^ทำงานปกติ$/i, 'พร้อม'],
    ];
    document.querySelectorAll('h1,h2,h3,h4,strong,span,div,p,small,button').forEach((node) => {
      if (node.children.length) return;
      const text = (node.textContent || '').trim();
      if (!text) return;
      const match = replacements.find(([pattern]) => pattern.test(text));
      if (match) node.textContent = match[1];
    });
  }

  function unlockLiveUiPreviewStep() {
    installLiveUiPreviewStatusBridge();
    if (!window.__npClearLiveUiPreviewOnRealStart) {
      window.__npClearLiveUiPreviewOnRealStart = true;
      document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('button');
        if (!button) return;
        const text = (button.textContent || '').replace(/\s+/g, '');
        if (text.includes('เริ่มไลฟ์') && !text.includes('หยุดไลฟ์')) clearLiveUiPreviewStep();
      }, true);
    }
    if (!window.__npLiveUiPreviewStepClickGuard) {
      window.__npLiveUiPreviewStepClickGuard = true;
      document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('.stepper button.step, .stepper button');
        if (!button) return;
        if (!isLiveStepButton(button)) {
          sessionStorage.removeItem(LIVE_UI_PREVIEW_KEY);
          return;
        }
        enableLiveUiPreviewStep();
      }, true);
    }
    if (isLiveUiPreviewActive()) setCurrentAccountStep(6, 6);
    const accounts = getAccounts();
    if (!accounts.length) return;
    const accountId = currentAccountId();
    let changed = false;
    const nextAccounts = accounts.map((account) => {
      if (account.id !== accountId) return account;
      if (Number(account.maxStep || 1) >= 6) return account;
      changed = true;
      return { ...account, maxStep: 6 };
    });
    if (changed) writeAccounts(nextAccounts);
    const stepButtons = [...document.querySelectorAll('.stepper button.step, .stepper button')];
    const liveStep = stepButtons.find(isLiveStepButton);
    if (!liveStep || liveStep.dataset.npLiveUiPreviewUnlocked === '1') return;
    liveStep.disabled = false;
    liveStep.removeAttribute('disabled');
    liveStep.style.setProperty('pointer-events', 'auto', 'important');
    liveStep.dataset.npLiveUiPreviewUnlocked = '1';
    liveStep.addEventListener('click', () => {
      enableLiveUiPreviewStep();
    }, true);
    patchLiveUiPreviewCopy();
  }

  function notify(message, tone = 'info') {
    if (window.npNotify) window.npNotify(message, { tone });
    else console.log(message);
  }

  function fmtAdsNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString('th-TH', { maximumFractionDigits: 2 }) : '0';
  }

  function fmtAdsDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
  }

  function escapeAds(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function adsStatusTone(value) {
    const text = String(value || '').toLowerCase();
    if (['active', 'enable', 'healthy', 'success', 'ใช้งานอยู่', 'กำลังใช้งาน'].some((item) => text.includes(item))) return 'ok';
    if (['error', 'invalid', 'expired', 'fail', 'ปิด', 'ผิดพลาด'].some((item) => text.includes(item))) return 'warn';
    return '';
  }

  function adsRowTitle(item) {
    return item.campaign_name || item.name || item.display_name || item.account_name || item.brand || '-';
  }

  async function saveAdsItem(form, kind) {
    const host = document.querySelector('[data-np-ads-hub]');
    const payload = { kind };
    new FormData(form).forEach((value, key) => {
      payload[key] = value;
    });
    const response = await fetch('/api/ads-tiktok/item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-NP-Web': '1' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw Error(data.error || 'บันทึกข้อมูลแอดไม่สำเร็จ');
    form.reset();
    if (host) renderAdsHub(host, data);
    notify('บันทึกข้อมูลแอดใน Digital NP Studio แล้ว', 'success');
  }

  function renderAdsHub(host, data) {
    const summary = data.summary || {};
    const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const rules = Array.isArray(data.rules) ? data.rules : [];
    const logs = Array.isArray(data.logs) ? data.logs : [];
    let active = localStorage.getItem('np.ads.tab') || 'dashboard';
    if (active === 'rulesCreate') {
      active = 'rules';
      localStorage.setItem('np.ads.tab', active);
    }
    const tabs = [
      ['dashboard', 'ยิงแอดหน้าหลัก'],
      ['rulesCreate', 'กฎของฉัน-สร้างโฆษณา LIVE GMV Max'],
      ['accounts', 'ตั้งค่าบัญชี'],
      ['history', 'ประวัติการทำงาน'],
    ];
    const campaignRows = campaigns.length ? campaigns.map((item) => `
      <div class="np-ads-row">
        <div><b>${escapeAds(adsRowTitle(item))}</b><small>${escapeAds(item.brand || '-')} · ${escapeAds(item.campaign_id || '-')}</small></div>
        <span class="np-ads-pill ${adsStatusTone(item.delivery_status)}">${escapeAds(item.delivery_status || '-')}</span>
        <div class="np-hide-sm"><b>${fmtAdsNumber(item.roi)}</b><small>ROI</small></div>
        <div class="np-hide-sm"><b>${fmtAdsNumber(item.current_budget)}</b><small>งบ</small></div>
        <div><b>${fmtAdsNumber(item.gross_revenue)}</b><small>รายได้</small></div>
      </div>
    `).join('') : '<div class="np-ads-row"><div><b>ยังไม่มีแคมเปญ</b><small>เพิ่มแคมเปญจากหน้า “สร้างโฆษณา”</small></div></div>';
    const ruleRows = rules.length ? rules.map((item) => `<div class="np-ads-mini"><div><b>${escapeAds(item.name || '-')}</b><small>${escapeAds(item.brand || '-')} · ${escapeAds(item.campaign_type || '-')} · ${fmtAdsNumber(item.product_count)} สินค้า</small></div><span class="np-ads-pill ${adsStatusTone(item.status)}">${escapeAds(item.status || '-')}</span></div>`).join('') : '<div class="np-ads-mini"><div><b>ยังไม่มีกฎแคมเปญ</b><small>เพิ่มกฎจากหน้า “กฎของฉัน”</small></div></div>';
    const accountRows = accounts.length ? accounts.map((item) => `<div class="np-ads-mini"><div><b>${escapeAds(item.display_name || item.account_name || '-')}</b><small>${escapeAds(item.brand || '-')} · อัปเดต ${escapeAds(fmtAdsDate(item.updated_at))}</small></div><span class="np-ads-pill ${adsStatusTone(item.cookie_status)}">${escapeAds(item.cookie_status || '-')}</span></div>`).join('') : '<div class="np-ads-mini"><div><b>ยังไม่มีบัญชีแอด</b><small>เพิ่มบัญชีจากหน้า “ตั้งค่าบัญชี”</small></div></div>';
    const logRows = logs.length ? logs.map((item) => `<div class="np-ads-mini"><div><b>${escapeAds(item.event_type || 'log')}</b><small>${escapeAds(item.brand || '-')} · ${escapeAds(item.reason || item.decision || '-')}</small></div><span class="np-ads-pill ${adsStatusTone(item.status)}">${escapeAds(fmtAdsDate(item.created_at))}</span></div>`).join('') : '<div class="np-ads-mini"><div><b>ยังไม่มีประวัติ</b><small>เมื่อเพิ่มบัญชี แคมเปญ หรือกฎ ระบบจะบันทึกตรงนี้</small></div></div>';
    const forms = {
      account: `
        <form class="np-ads-form" data-np-ads-form="account">
          <strong>เพิ่มบัญชีแอด</strong>
          <input name="display_name" placeholder="ชื่อบัญชีของงานเรา" required>
          <input name="brand" placeholder="ร้าน / แบรนด์">
          <button type="submit">บันทึกบัญชี</button>
        </form>`,
      campaign: `
        <form class="np-ads-form" data-np-ads-form="campaign">
          <strong>สร้างแคมเปญ LIVE GMV Max</strong>
          <input name="campaign_name" placeholder="ชื่อแคมเปญของงานเรา" required>
          <div class="np-ads-form-row">
            <input name="brand" placeholder="แบรนด์">
            <input name="campaign_id" placeholder="Campaign ID">
          </div>
          <div class="np-ads-form-row">
            <input name="current_budget" type="number" min="0" step="1" placeholder="งบต่อวัน (THB)">
            <input name="target_roi" type="number" min="0" step="0.01" placeholder="ยอดขายเป้า ROI">
          </div>
          <div class="np-ads-form-row">
            <input name="cost" type="number" min="0" step="0.01" placeholder="ต้นทุน">
            <input name="gross_revenue" type="number" min="0" step="0.01" placeholder="รายได้">
          </div>
          <select name="delivery_status"><option value="active">เปิดใช้งาน</option><option value="paused">พักไว้</option></select>
          <button type="submit">บันทึกแคมเปญ</button>
        </form>`,
      rule: `
        <form class="np-ads-form" data-np-ads-form="rule">
          <strong>เพิ่มกฎแคมเปญ</strong>
          <input name="name" placeholder="ชื่อกฎ เช่น เพิ่มงบเมื่อ ROI ดี" required>
          <input name="brand" placeholder="แบรนด์">
          <div class="np-ads-form-row">
            <input name="product_count" type="number" min="0" step="1" placeholder="จำนวนสินค้า">
            <select name="status"><option value="active">เปิดใช้งาน</option><option value="paused">พักไว้</option></select>
          </div>
          <button type="submit">บันทึกกฎ</button>
        </form>`,
    };
    const pages = {
      dashboard: `
        <section class="np-ads-grid">
          <article class="np-ads-card">
            <div class="np-ads-card-head"><div><strong>ร้านค้าที่พบแคมเปญ</strong><br><small>ภาพรวมจากข้อมูลที่บันทึกในงานเรา</small></div><span class="np-ads-pill ok">Digital NP</span></div>
            <div class="np-ads-table">${campaignRows}</div>
          </article>
          <div class="np-ads-card">
            <div class="np-ads-card-head"><div><strong>สรุปรายการแคมเปญ</strong><br><small>บัญชี กฎ และกิจกรรมล่าสุด</small></div></div>
            <div class="np-ads-list">${accountRows}${ruleRows}${logRows}</div>
          </div>
        </section>`,
      rulesCreate: `
        <section class="np-ads-grid">
          <article class="np-ads-card">
            <div class="np-ads-card-head"><div><strong>กฎของฉัน</strong><br><small>รายการแคมเปญและกฎที่ใช้ควบคุม</small></div><span class="np-ads-pill">${rules.length} กฎ</span></div>
            <div class="np-ads-list">${ruleRows}</div>
          </article>
          <div class="np-ads-card">
            <div class="np-ads-card-head"><div><strong>เพิ่มกฎใหม่</strong><br><small>ใช้กับแคมเปญในงานนี้</small></div></div>
            <div class="np-ads-list">${forms.rule}</div>
          </div>
          <article class="np-ads-card">
            <div class="np-ads-card-head"><div><strong>สร้างโฆษณา LIVE GMV Max</strong><br><small>ตั้งชื่อ งบ ROI และสถานะของแคมเปญ</small></div></div>
            <div class="np-ads-list">${forms.campaign}</div>
          </article>
          <article class="np-ads-card" style="grid-column:1 / -1">
            <div class="np-ads-card-head"><div><strong>แคมเปญล่าสุด</strong><br><small>แสดงหลังบันทึกทันที</small></div><span class="np-ads-pill">${campaigns.length} รายการ</span></div>
            <div class="np-ads-table">${campaignRows}</div>
          </article>
        </section>`,
      accounts: `
        <section class="np-ads-grid">
          <article class="np-ads-card"><div class="np-ads-card-head"><div><strong>ตั้งค่าบัญชี</strong><br><small>บัญชี TikTok Ads / Cookie สำหรับเชื่อมต่อ</small></div><span class="np-ads-pill">${accounts.length} บัญชี</span></div><div class="np-ads-list">${accountRows}</div></article>
          <div class="np-ads-card"><div class="np-ads-card-head"><div><strong>เพิ่มบัญชีใหม่</strong><br><small>เก็บใน Digital NP Studio เท่านั้น</small></div></div><div class="np-ads-list">${forms.account}</div></div>
        </section>`,
      history: `
        <section class="np-ads-card">
          <div class="np-ads-card-head"><div><strong>ประวัติการทำงาน</strong><br><small>รายการที่ระบบบันทึกจากเมนูแอดของงานเรา</small></div><button class="np-ads-tab" type="button" data-np-ads-refresh>รีเฟรช</button></div>
          <div class="np-ads-list">${logRows}</div>
        </section>`,
    };
    host.innerHTML = `
      <section class="np-ads-hero">
        <div class="np-ads-hero-top">
          <div>
            <h2>Ads Manager</h2>
            <p>ระบบแอดของ Digital NP Studio เอง ตั้งบัญชี แคมเปญ และกฎใช้งานได้จากเมนูนี้</p>
          </div>
          <div class="np-ads-actions">
            <button class="primary" type="button" data-np-ads-refresh>รีเฟรชข้อมูล</button>
          </div>
        </div>
        ${data.ok ? '' : `<div class="np-ads-error">${escapeAds(data.error || 'โหลดข้อมูลแอดไม่สำเร็จ')}</div>`}
        <div class="np-ads-kpis">
          <div class="np-ads-kpi"><span>บัญชีทั้งหมด</span><strong>${fmtAdsNumber(summary.accounts)}</strong></div>
          <div class="np-ads-kpi"><span>บัญชีพร้อมใช้</span><strong>${fmtAdsNumber(summary.healthy_accounts)}</strong></div>
          <div class="np-ads-kpi"><span>กฎที่ทำงาน</span><strong>${fmtAdsNumber(summary.active_rules)}</strong></div>
          <div class="np-ads-kpi"><span>แคมเปญกำลังใช้</span><strong>${fmtAdsNumber(summary.active_campaigns)}</strong></div>
          <div class="np-ads-kpi"><span>สินค้าในระบบ</span><strong>${fmtAdsNumber(summary.products)}</strong></div>
        </div>
      </section>
      ${pages[active] || pages.dashboard}
    `;
    host.querySelectorAll('[data-np-ads-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        localStorage.setItem('np.ads.tab', button.dataset.npAdsTab || 'dashboard');
        renderAdsHub(host, data);
      });
    });
    host.querySelector('[data-np-ads-refresh]')?.addEventListener('click', () => {
      host.dataset.loading = '1';
      loadAdsHub(true);
    });
    host.querySelectorAll('[data-np-ads-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        const original = button?.textContent || 'บันทึก';
        if (button) {
          button.disabled = true;
          button.textContent = 'กำลังบันทึก...';
        }
        try {
          await saveAdsItem(form, form.dataset.npAdsForm);
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), 'warning');
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = original;
          }
        }
      });
    });
  }

  function renderAdsHub(host, data) {
    const summary = data.summary || {};
    const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    const accounts = Array.isArray(data.accounts) ? data.accounts : [];
    const rules = Array.isArray(data.rules) ? data.rules : [];
    const logs = Array.isArray(data.logs) ? data.logs : [];
    let active = localStorage.getItem('np.ads.tab') || 'dashboard';
    if (active === 'rulesCreate') {
      active = 'rules';
      localStorage.setItem('np.ads.tab', active);
    }
    const liveCampaigns = campaigns.filter((item) => String(item.campaign_type || item.type || 'live').toLowerCase() !== 'product');
    const totalCost = campaigns.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
    const totalRevenue = campaigns.reduce((sum, item) => sum + (Number(item.gross_revenue) || 0), 0);
    const avgRoi = totalCost > 0 ? totalRevenue / totalCost : 0;
    const accountCount = Number(summary.accounts || accounts.length || 0);
    const activeRules = Number(summary.active_rules || rules.filter((item) => String(item.status || '').toLowerCase() === 'active').length || 0);
    const activeCampaigns = Number(summary.active_campaigns || campaigns.filter((item) => String(item.delivery_status || '').toLowerCase().includes('active')).length || 0);
    const healthyAccounts = Number(summary.healthy_accounts || accounts.filter((item) => String(item.cookie_status || '').includes('ปกติ') || String(item.cookie_status || '').toLowerCase().includes('active')).length || 0);
    const realShopName = accounts[0]?.brand || accounts[0]?.display_name || campaigns[0]?.brand || '';
    const shopName = escapeAds(realShopName || 'ยังไม่มีร้านค้า');
    const campaignTableRows = campaigns.length ? campaigns.map((item) => `
      <div class="np-src-row">
        <div><b>${escapeAds(item.campaign_name || item.name || 'แคมเปญไม่มีชื่อ')}</b><small>${escapeAds(item.brand || realShopName || 'ยังไม่ได้ระบุร้าน')} · ${escapeAds(item.campaign_id || '-')}</small></div>
        <span class="np-src-pill ${String(item.campaign_type || 'live').toLowerCase().includes('live') ? 'red' : 'soft'}">${String(item.campaign_type || 'Live').toLowerCase().includes('live') ? 'Live' : 'GMV Max'}</span>
        <span class="np-src-pill">${escapeAds(item.brand || shopName)}</span>
        <span>${escapeAds(item.campaign_id || '-')}</span>
        <span class="np-src-pill">${escapeAds(item.delivery_status || 'รอตรวจสอบสถานะ')}</span>
        <div class="np-src-actions"><button class="start">เริ่ม</button><button class="edit">แก้ไข</button><button class="copy">คัดลอก</button><button class="rule">แคมเปญ</button><button class="history">ประวัติ</button><button class="delete">ลบ</button></div>
      </div>
    `).join('') : `
      <div class="np-src-empty">มีร้านค้าที่เชื่อมแล้ว แต่ยังไม่มีรายการแคมเปญตามตัวกรองปัจจุบัน</div>
    `;
    const accountRows = accounts.length ? accounts.map((item, index) => `
      <div class="np-src-row">
        <span>${index + 1}</span>
        <div><b>${escapeAds(item.display_name || item.account_name || 'บัญชีไม่มีชื่อ')}</b><small>${escapeAds(item.brand || 'ยังไม่ได้ระบุร้าน')} | Digital NP Studio</small></div>
        <span class="np-src-pill green">${escapeAds(item.cookie_status || 'ปกติ')}</span>
        <code>${escapeAds(item.cookie_preview || '-')}</code>
        <span>${escapeAds(fmtAdsDate(item.updated_at) || '-')}</span>
        <div class="np-src-actions"><button class="start">ตรวจสอบ</button><button class="edit">แก้ไข</button><button class="delete">ลบ</button></div>
      </div>
    `).join('') : `
      <div class="np-src-empty">ยังไม่มีบัญชีแอดในงานนี้ เพิ่มบัญชีจากฟอร์มด้านบนก่อน</div>
    `;
    const historyRows = logs.length ? logs.map((item) => `
      <div class="np-src-row">
        <span>${escapeAds(fmtAdsDate(item.created_at) || '-')}</span>
        <b>${escapeAds(item.brand || shopName)}</b>
        <code>${escapeAds(item.event_type || 'log')}</code>
        <span>${escapeAds(item.reason || item.decision || 'อัปเดตค่าคู่วางแคมเปญที่แก้ไขใน TikTok Seller')}</span>
        <span class="np-src-pill ${String(item.status || '').toLowerCase().includes('fail') ? 'red' : 'green'}">${escapeAds(item.status || 'สำเร็จ')}</span>
        <span></span>
      </div>
    `).join('') : '<div class="np-src-empty">ยังไม่มีประวัติการทำงานของระบบแอดในงานนี้</div>';
    const dashboardPage = `
      <section class="np-src-shell">
        <aside class="np-src-panel">
          <div><h3>ตัวกรอง</h3><small>ข้อมูลล่าสุดจาก TikTok Seller</small></div>
          <input class="np-src-search" placeholder="ค้นหาชื่อร้าน..." value="">
          <div class="np-src-toggle"><span>เฉพาะแคมเปญวันนี้</span><span></span></div>
          <div class="np-src-toggle"><span>เฉพาะแคมเปญที่เปิดอยู่</span><span></span></div>
          <div class="np-src-toggle"><span>ซ่อนร้านค้าที่ไม่มีรายการแคมเปญ</span><span></span></div>
          <div class="np-src-toggle"><span>เบลอชื่อร้าน</span><span style="background:#cbd5e1!important"></span></div>
          <div class="np-src-panel" style="padding:12px!important;box-shadow:none!important">
            <h3>สรุปรายการแคมเปญ</h3>
            <div class="np-src-summary">
              <div class="np-src-summary-row"><span>รายการทั้งหมด</span><b>${fmtAdsNumber(campaigns.length)}</b></div>
              <div class="np-src-summary-row"><span>กำลังใช้งาน</span><b style="color:#059669">${fmtAdsNumber(activeCampaigns)}</b></div>
              <div class="np-src-summary-row"><span>แคมเปญที่เปิดอยู่</span><b style="color:#2563eb">${fmtAdsNumber(campaigns.length)}</b></div>
              <div class="np-src-summary-row"><span>บัญชีทั้งหมด</span><b>${fmtAdsNumber(accountCount)}</b></div>
            </div>
          </div>
        </aside>
        <main class="np-src-main">
          <section class="np-src-card">
            <div class="np-src-card-head"><div class="np-src-card-title"><div class="np-src-kicker">แดชบอร์ดโฆษณา</div><h2>Dashboard</h2><small>ภาพรวมการทำงานของระบบทั้งหมด</small></div><button class="np-src-button primary" data-np-ads-refresh>รีเฟรช</button></div>
          </section>
          <section class="np-src-metrics">
            <div class="np-src-metric"><span>ต้นทุน</span><strong>${fmtAdsNumber(totalCost)}</strong><small>THB</small></div>
            <div class="np-src-metric"><span>ROI</span><strong>${fmtAdsNumber(avgRoi)}</strong><small>ผลตอบแทนรวม</small></div>
            <div class="np-src-metric"><span>ต้นทุนต่อคำสั่งซื้อ</span><strong>${fmtAdsNumber(campaigns.length ? totalCost / Math.max(campaigns.length, 1) : 0)}</strong><small>THB</small></div>
            <div class="np-src-metric"><span>รายได้</span><strong>${fmtAdsNumber(totalRevenue)}</strong><small>THB</small></div>
          </section>
          <section class="np-src-card">
            <div class="np-src-card-head"><div><h3>ร้านค้าทั้งหมด (${accountCount || 0})</h3><small>สรุปแต่ละร้านตามตัวกรองปัจจุบัน</small></div><span class="np-src-pill green">TikTok Seller</span></div>
            <div class="np-src-empty">มีร้านค้าที่เชื่อมแล้ว แต่ยังไม่มีรายการแคมเปญตามตัวกรองปัจจุบัน</div>
          </section>
        </main>
      </section>`;
    const rulesPage = `
      <section class="np-src-shell">
        <aside class="np-src-panel">
          <div><h3>ตัวกรอง</h3><small>ประเภทแคมเปญ</small></div>
          <button class="np-src-button primary">ทั้งหมด</button>
          <button class="np-src-button">GMV Max ของสินค้า</button>
          <button class="np-src-button">LIVE GMV Max</button>
          <input class="np-src-search" placeholder="ค้นหาร้าน / แคมเปญ">
          <div class="np-src-panel" style="padding:12px!important;box-shadow:none!important">
            <h3>สรุปรายการแคมเปญ</h3>
            <div class="np-src-summary">
              <div class="np-src-summary-row"><span>รายการทั้งหมด</span><b>${fmtAdsNumber(campaigns.length)}</b></div>
              <div class="np-src-summary-row"><span>โควต้าแพ็กเกจ</span><b style="color:#2563eb">${fmtAdsNumber(campaigns.length)} / ${fmtAdsNumber(summary.campaign_limit || 0)}</b></div>
              <div class="np-src-summary-row"><span>หมดอายุ</span><b>${escapeAds(summary.expires_at ? fmtAdsDate(summary.expires_at) : '-')}</b></div>
              <div class="np-src-summary-row"><span>กำลังใช้งาน</span><b style="color:#059669">${fmtAdsNumber(activeRules)}</b></div>
            </div>
          </div>
        </aside>
        <main class="np-src-main">
          <section class="np-src-card">
            <div class="np-src-card-head"><div><h2>กฎของฉัน</h2><small>สร้างโฆษณา GMV Max และติดตามค่าจาก TikTok Seller</small></div><div><button class="np-src-button">รายการแคมเปญ</button> <button class="np-src-button" data-np-ads-refresh>รีเฟรช</button></div></div>
            <div class="np-src-card" style="box-shadow:none!important;padding:0!important;overflow:hidden!important">
              <div class="np-src-card-head"><div><b>${shopName}</b><small>BC: ${escapeAds(summary.business_center || 'ยังไม่พบ')} | Adv: ${escapeAds(summary.ad_account || 'ยังไม่พบ')} | ร้านค้า: ${shopName}</small></div><div><span class="np-src-pill">แคมเปญ ${campaigns.length}</span> <span class="np-src-pill green">TikTok ${accountCount}</span> <span class="np-src-pill">${accountCount ? 'พร้อมตรวจสอบ' : 'ยังไม่พร้อมใช้งาน'}</span></div></div>
              <div class="np-src-table">
                <div class="np-src-row head"><span>ชื่อแคมเปญ</span><span>ประเภท</span><span>บัญชี TikTok / สินค้า</span><span>Campaign ID</span><span>สถานะ</span><span>จัดการ</span></div>
                ${campaignTableRows}
              </div>
            </div>
          </section>
        </main>
      </section>`;
    const createLivePage = `
      <section class="np-src-main">
        <section class="np-src-card">
          <div class="np-src-card-head"><div><h2>สร้างโฆษณา LIVE GMV Max</h2><small>หน้า Create Campaign แยกจากกฎของฉัน ตาม flow ต้นฉบับ</small></div></div>
          <form class="np-src-form" data-np-ads-form="campaign">
            <div class="np-src-card" style="box-shadow:none!important;background:#eff6ff!important;border-color:#bfdbfe!important">
              <div class="np-src-card-head" style="border-bottom:0!important;margin:0!important">
                <div><h3>ตัวช่วยตั้งกฎอัตโนมัติ</h3><small>แยกจาก flow ปกติของการสร้างแคมเปญ เพื่อให้กลับมากู้ข้อมูลหลังจบไลฟ์ได้</small></div>
              </div>
              <div class="np-src-metrics" style="grid-template-columns:1fr 1fr!important">
                <div class="np-src-card" style="box-shadow:none!important"><h3>สูตรจบสำเร็จรูป</h3><small>เลือกสูตรที่ใช้บ่อย ระบบจะเติมยอดขายเป้าและงบต่อวันให้ทันที</small><div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><span class="np-src-pill soft">ROI 17</span><span class="np-src-pill soft">ROI 18</span><span class="np-src-pill soft">ROI 19</span></div></div>
                <div class="np-src-card" style="box-shadow:none!important"><h3>คูปอง</h3><small>ตั้งค่าใช้ต้นทุนคูปองเท่าไหร่ แล้วให้ปรับงบเป็นเท่าไหร่</small><div style="margin-top:10px"><span class="np-src-pill">กดเพื่อเปิด popup</span></div></div>
              </div>
            </div>
            <section class="np-src-card" style="box-shadow:none!important">
              <h3>เลือกบัญชี</h3>
              <div class="np-src-form-grid">
                <div class="np-src-field"><label>บัญชี</label><input name="brand" placeholder="เลือกบัญชีของงานเรา"></div>
                <div class="np-src-field"><label>ศูนย์ธุรกิจ</label><input placeholder="เลือก BC"></div>
                <div class="np-src-field"><label>บัญชีโฆษณา</label><input placeholder="เลือกบัญชีโฆษณา"></div>
                <div class="np-src-field"><label>ร้านค้า</label><input placeholder="เลือกร้านค้า"></div>
              </div>
              <div class="np-src-card" style="box-shadow:none!important;background:#f8fafc!important;margin-top:10px!important">
                <h3>แหล่งที่มา</h3>
                <small>เลือกบัญชี ร้านค้า และบัญชีโฆษณาให้ตรงกับ Seller จากนั้นเลือกสินค้า/ช่องไลฟ์ที่ต้องการยิง</small>
                <div style="display:flex;gap:8px;margin-top:12px;align-items:center"><button class="np-src-button" type="button">เลือก ช่องไลฟ์</button><span class="np-src-pill">ช่องไลฟ์ ${fmtAdsNumber(summary.live_sources || 0)}</span><button class="np-src-button" type="button" style="margin-left:auto">รีเฟรช</button></div>
                <div class="np-src-notice" style="margin-top:12px">เลือกบัญชี ร้านค้า และบัญชีโฆษณาให้ครบก่อน ระบบถึงจะดึงช่องไลฟ์ได้</div>
              </div>
            </section>
            <section class="np-src-card" style="box-shadow:none!important">
              <h3>1. การตั้งค่าแคมเปญ</h3>
              <small>กรอกชื่อแคมเปญ งบต่อวัน และยอดขายเป้า (ROI)</small>
              <div class="np-src-form-grid" style="grid-template-columns:1fr 1fr!important;margin-top:12px!important">
                <div class="np-src-field"><label>ชื่อแคมเปญ</label><input name="campaign_name" placeholder="ชื่อแคมเปญของงานเรา" required></div>
                <div class="np-src-field"><label>งบต่อวัน (THB)</label><input name="current_budget" type="number" placeholder="งบต่อวัน"></div>
                <div class="np-src-field"><label>ยอดขายเป้า (ROI)</label><input name="target_roi" type="number" step="0.1" placeholder="ROI"></div>
                <div class="np-src-field"><label>สถานะ</label><select name="delivery_status"><option value="active">เปิดใช้งาน</option><option value="paused">พักไว้</option></select></div>
              </div>
            </section>
            <section class="np-src-card" style="box-shadow:none!important">
              <h3>4. ปิดตัวเดิม แล้วขึ้นตัวใหม่</h3>
              <div class="np-src-notice" style="margin-top:10px">ลำดับเดิมไม่เดิน ให้ขึ้นตัวใหม่อัตโนมัติ ถ้าโฆษณาเดิมหมดหรือหยุดแสดง ระบบจะปิดตัวเดิมแล้วขึ้นตัวใหม่ให้</div>
              <div class="np-src-form-grid" style="grid-template-columns:1fr 1fr!important;margin-top:12px!important">
                <div class="np-src-field"><label>ยอดขายขั้นต่ำที่เริ่มได้ (ROI)</label><input placeholder="ROI"></div>
                <div class="np-src-field"><label>ค่าต่อออเดอร์สูงสุดที่รับได้</label><input placeholder="ค่าต่อออเดอร์"></div>
                <div class="np-src-field"><label>หาก order น้อยกว่าเป้าหมาย ให้ข้ามการทำงาน</label><input placeholder="เช่น 10"></div>
                <div class="np-src-field"><label>พักกี่นาทีก่อนปิดตัวใหม่</label><input placeholder="เช่น 60"></div>
              </div>
            </section>
            <section class="np-src-card" style="box-shadow:none!important"><h3>การตั้งค่าอื่นลง</h3><small>ตัวเลือกเพิ่มเติมสำหรับการสร้างโฆษณา</small></section>
            <div class="np-src-notice">รายการนี้จะถูกบันทึกไว้เพื่อสร้างโฆษณาไลฟ์ ด้วยบัญชีที่เลือก</div>
            <div style="display:flex;justify-content:flex-end;gap:10px"><button class="np-src-button" type="button" data-np-ads-goto-rules>กลับไปกฎของฉัน</button><button class="np-src-button primary" type="submit">สร้างโฆษณาไลฟ์</button></div>
          </form>
        </section>
      </section>`;
    const accountsPage = `
      <section class="np-src-main">
        <section class="np-src-card">
          <div class="np-src-card-head"><div><h2>ตั้งค่าบัญชี</h2><small>จัดการบัญชี TikTok Ads และ Cookie สำหรับการเชื่อมต่อ</small></div><div><button class="np-src-button" data-np-ads-refresh>รีเฟรชบัญชี</button> <button class="np-src-button primary">เพิ่มบัญชีใหม่</button></div></div>
          <div class="np-src-tabs"><button class="active">บัญชี TikTok Ads</button><button>การเชื่อมต่อผ่าน Telegram</button></div>
          <div class="np-src-stats">
            <div class="np-src-stat"><span class="np-src-stat-icon">👥</span><div><span>บัญชีทั้งหมด</span><strong>${fmtAdsNumber(accountCount)}</strong><small>บัญชี</small></div></div>
            <div class="np-src-stat"><span class="np-src-stat-icon" style="background:#10b981!important">✓</span><div><span>ใช้งานได้</span><strong>${fmtAdsNumber(healthyAccounts)}</strong><small>บัญชี</small></div></div>
            <div class="np-src-stat"><span class="np-src-stat-icon" style="background:#fbbf24!important">!</span><div><span>ใกล้หมดอายุ</span><strong>0</strong><small>บัญชี</small></div></div>
            <div class="np-src-stat"><span class="np-src-stat-icon" style="background:#ef4444!important">×</span><div><span>ใช้ไม่ได้</span><strong>0</strong><small>บัญชี</small></div></div>
          </div>
          <div class="np-src-card" style="box-shadow:none!important;margin-bottom:10px!important">
            <h3>ค้นหาและคัดกรอง</h3>
            <input class="np-src-search" placeholder="ค้นหาบัญชี หรือ TikTok บัญชี..." style="margin-top:10px!important">
          </div>
          <form class="np-src-form" data-np-ads-form="account" style="margin-bottom:10px!important">
            <div class="np-src-form-grid" style="grid-template-columns:1fr 1fr auto!important">
              <div class="np-src-field"><label>ชื่อบัญชี</label><input name="display_name" placeholder="ชื่อบัญชีของงานเรา" required></div>
              <div class="np-src-field"><label>ร้าน / แบรนด์</label><input name="brand" placeholder="ร้านหรือแบรนด์ของงานเรา"></div>
              <button class="np-src-button primary" type="submit" style="align-self:end!important">บันทึกบัญชี</button>
            </div>
          </form>
          <div class="np-src-table">
            <div class="np-src-row head"><span>#</span><span>ชื่อบัญชี</span><span>สถานะ</span><span>Cookie Preview</span><span>อัปเดตล่าสุด</span><span>จัดการ</span></div>
            ${accountRows}
          </div>
        </section>
      </section>`;
    const historyPage = `
      <section class="np-src-main">
        <section class="np-src-card">
          <div class="np-src-card-head"><div><h2>ประวัติการทำงาน</h2><small>รายการทำงานของระบบ แยกออกจากหน้าหลัก</small></div><button class="np-src-button primary" data-np-ads-refresh>รีเฟรช</button></div>
        </section>
        <section class="np-src-stats">
          <div class="np-src-stat"><span class="np-src-stat-icon">👥</span><div><span>รายการทั้งหมด</span><strong>${fmtAdsNumber(logs.length)}</strong><small>รายการ</small></div></div>
          <div class="np-src-stat"><span class="np-src-stat-icon" style="background:#10b981!important">✓</span><div><span>สำเร็จ</span><strong>${fmtAdsNumber(logs.filter((item) => !String(item.status || '').toLowerCase().includes('fail')).length)}</strong><small>รายการ</small></div></div>
          <div class="np-src-stat"><span class="np-src-stat-icon" style="background:#ef4444!important">×</span><div><span>ไม่สำเร็จ</span><strong>${fmtAdsNumber(logs.filter((item) => String(item.status || '').toLowerCase().includes('fail')).length)}</strong><small>รายการ</small></div></div>
          <div class="np-src-stat"><div><span>อัปเดตล่าสุด</span><strong style="font-size:16px!important">${escapeAds(logs[0]?.created_at ? fmtAdsDate(logs[0].created_at) : '-')}</strong><small>เวลาล่าสุดในระบบ</small></div></div>
        </section>
        <section class="np-src-card">
          <div class="np-src-card-head"><div><h3>รายการประวัติการทำงาน</h3></div></div>
          <div class="np-src-table">
            <div class="np-src-row head"><span>เวลา</span><span>ร้าน</span><span>ประเภทงาน</span><span>รายละเอียด</span><span>สถานะ</span><span></span></div>
            ${historyRows}
          </div>
        </section>
      </section>`;
    const pages = { dashboard: dashboardPage, rules: rulesPage, createLive: createLivePage, accounts: accountsPage, history: historyPage };
    const titleMap = {
      dashboard: ['Dashboard', 'ติดตามแคมเปญ GMV Max จาก TikTok Seller'],
      rules: ['แคมเปญ', 'กฎของฉัน'],
      createLive: ['สร้างโฆษณา LIVE GMV Max', 'ติดตามแคมเปญ GMV Max จาก TikTok Seller'],
      accounts: ['Accounts / Cookies', 'ติดตามแคมเปญ GMV Max จาก TikTok Seller'],
      history: ['ประวัติการทำงาน', 'ติดตามแคมเปญ GMV Max จาก TikTok Seller'],
    };
    const [title, subtitle] = titleMap[active] || titleMap.dashboard;
    host.classList.add('np-ads-source-ui');
    host.innerHTML = `
      <section class="np-src-top">
        <div>
          <div class="np-src-brand"><span class="np-src-logo">NP</span><span class="np-src-kicker">NP ADS TIKTOK</span></div>
          <h1>${escapeAds(title)}</h1>
          <p>${escapeAds(subtitle)}</p>
        </div>
        <div><button class="np-src-button primary" data-np-ads-refresh>รีเฟรชข้อมูล</button></div>
      </section>
      ${data.ok ? '' : `<div class="np-src-notice" style="margin-bottom:12px!important">${escapeAds(data.error || 'โหลดข้อมูลแอดไม่สำเร็จ')}</div>`}
      ${pages[active] || pages.dashboard}
    `;
    host.querySelectorAll('[data-np-ads-refresh]').forEach((button) => button.addEventListener('click', () => {
      host.dataset.loading = '1';
      loadAdsHub(true);
    }));
    host.querySelector('[data-np-ads-goto-rules]')?.addEventListener('click', () => {
      localStorage.setItem('np.ads.tab', 'rules');
      renderAdsHub(host, data);
      syncAdsSidebarMenu();
    });
    host.querySelectorAll('[data-np-ads-form]').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        const original = button?.textContent || 'บันทึก';
        if (button) {
          button.disabled = true;
          button.textContent = 'กำลังบันทึก...';
        }
        try {
          await saveAdsItem(form, form.dataset.npAdsForm);
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), 'warning');
        } finally {
          if (button) {
            button.disabled = false;
            button.textContent = original;
          }
        }
      });
    });
  }

  async function loadAdsHub(force = false) {
    if (!ADS_MANAGER_ENABLED) return;
    const host = document.querySelector('[data-np-ads-hub]');
    if (!host || (host.dataset.loaded === '1' && !force) || host.dataset.loading === '1') return;
    host.dataset.loading = '1';
    if (!host.dataset.loaded) host.innerHTML = '<section class="np-ads-hero"><div class="np-ads-hero-top"><div><h2>กำลังโหลดข้อมูลแอด...</h2><p>กำลังเปิดข้อมูล Ads Manager ของ Digital NP Studio</p></div></div></section>';
    try {
      const response = await fetch('/api/ads-tiktok/overview', { cache: 'no-store' });
      const data = await response.json();
      renderAdsHub(host, data);
      host.dataset.loaded = '1';
    } catch (error) {
      renderAdsHub(host, { ok: false, error: error?.message || String(error), summary: {}, accounts: [], campaigns: [], rules: [], logs: [] });
    } finally {
      host.dataset.loading = '0';
    }
  }

  function syncAdsSidebarMenu() {
    const nav = document.querySelector('aside nav');
    const appShell = document.querySelector('aside') && document.querySelector('main');
    if (!appShell) return;
    if (!nav) return;
    const adsButton = Array.from(nav.querySelectorAll('button')).find((button) => {
      const text = button.textContent || '';
      return text.includes('บอทยิงแอด') || text.includes('ยิงแอดหน้าหลัก');
    });
    if (!adsButton) return;
    if (!ADS_MANAGER_ENABLED) {
      if (adsButton.classList.contains('active')) {
        const dashboardButton = Array.from(nav.querySelectorAll('button')).find((button) => (button.textContent || '').includes('แดชบอร์ด'));
        dashboardButton?.click();
      }
      adsButton.remove();
      nav.querySelector('.np-ads-sidebar')?.remove();
      return;
    }
    const label = adsButton.querySelector('span');
    if (label) label.textContent = 'ยิงแอดหน้าหลัก';
    adsButton.dataset.npAdsRoot = 'true';
    if (!adsButton.dataset.npAdsRootBound) {
      adsButton.dataset.npAdsRootBound = 'true';
      adsButton.addEventListener('click', (event) => {
        if (event.isTrusted) localStorage.setItem('np.ads.tab', 'dashboard');
      });
    }
    let menu = nav.querySelector('.np-ads-sidebar');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'np-ads-sidebar';
      adsButton.insertAdjacentElement('afterend', menu);
    }
    const items = [
      ['rules', 'กฎของฉัน'],
      ['createLive', 'สร้างโฆษณา LIVE GMV Max'],
      ['accounts', 'ตั้งค่าบัญชี'],
      ['history', 'ประวัติการทำงาน'],
    ];
    let active = localStorage.getItem('np.ads.tab') || 'dashboard';
    if (active === 'rulesCreate') {
      active = 'rules';
      localStorage.setItem('np.ads.tab', active);
    }
    const signature = items.map(([id]) => id).join('|') + ':' + active;
    if (menu.dataset.signature !== signature) {
      menu.dataset.signature = signature;
      menu.innerHTML = items.map(([id, text]) => `<button type="button" class="${active === id ? 'active' : ''}" data-np-ads-side="${id}">${text}</button>`).join('');
      menu.querySelectorAll('[data-np-ads-side]').forEach((button) => {
        button.addEventListener('click', () => {
          localStorage.setItem('np.ads.tab', button.dataset.npAdsSide || 'dashboard');
          adsButton.click();
          window.setTimeout(() => loadAdsHub(true), 80);
        });
      });
    }
  }

  function clearOldAdsManagerUi(page) {
    page.querySelectorAll('.page-intro, section.card, .card').forEach((node) => {
      if (node.closest('[data-np-ads-hub]')) return;
      const text = node.textContent || '';
      const isOldAdsBlock = text.includes('Ads Manager') || text.includes('สแกนหน้า Ads Manager') || text.includes('ตั้งค่า ROI') || text.includes('CREATE CAMPAIGN') || text.includes('TIKTOK ADS MANAGER');
      if (isOldAdsBlock) node.dataset.npAdsOld = 'true';
    });
  }

  function enhanceAdsPage() {
    if (!ADS_MANAGER_ENABLED) return;
    const page = Array.from(document.querySelectorAll('.settings-page')).find((node) => {
      const text = node.textContent || '';
      return text.includes('Ads Manager') || text.includes('สแกนหน้า Ads Manager') || text.includes('ตั้งค่า ROI');
    });
    if (!page) return;
    clearOldAdsManagerUi(page);
    if (page.querySelector('[data-np-ads-hub]')) return;
    const hub = document.createElement('div');
    hub.className = 'np-ads-hub';
    hub.dataset.npAdsHub = 'true';
    const anchor = page.querySelector('.page-intro')?.nextElementSibling || page.firstElementChild;
    if (anchor) page.insertBefore(hub, anchor);
    else page.prepend(hub);
    loadAdsHub();
  }

  function stepHost() {
    return document.querySelector('.step-content');
  }

  function activeStepText() {
    return stepHost()?.textContent || '';
  }

  function isChatSettingsStep() {
    const text = activeStepText();
    return Boolean(document.querySelector('.chat-settings-card')) && text.includes('ตอบแชทอัตโนมัติ') && text.includes('ระบบตอบแชทตอน');
  }

  function isConnectTikTokStep() {
    const text = activeStepText();
    return text.includes('เชื่อม TikTok Streamer Desktop') && text.includes('ระบบตอบแชทตอน');
  }

  function isScheduleStep() {
    return isVideoStep();
  }

  function isVideoStep() {
    const text = activeStepText();
    return text.includes('เลือกวิดีโอที่จะเล่นซ้ำ') && text.includes('แหล่งวิดีโอ');
  }

  function isLiveRunningStep() {
    const text = activeStepText();
    return text.includes('สถานะ Pipeline')
      && text.includes('FFmpeg')
      && text.includes('RTMP')
      && (text.includes('หยุดไลฟ์') || text.includes('เริ่มไลฟ์'));
  }

  function removeWrongPanels() {
    if (!isChatSettingsStep()) {
      document.querySelector('.np-live-ai-tester')?.remove();
    }
    if (!isConnectTikTokStep()) {
      document.querySelector('.step-content')?.classList.remove('np-live-connect-step');
    }
    if (!isScheduleStep()) {
      document.querySelector('.np-live-schedule-card')?.remove();
    }
    if (!isVideoStep()) {
      document.querySelector('.np-live-video-queue')?.remove();
    }
    if (!isLiveRunningStep()) {
      document.querySelector('.step-content')?.classList.remove('np-live-running-step', 'np-live-native-step');
      document.querySelectorAll('.np-live-running-shell,.np-live-running-preview,.np-live-running-status,.np-live-running-chat').forEach((node) => {
        node.classList.remove('np-live-running-shell', 'np-live-running-preview', 'np-live-running-status', 'np-live-running-chat');
      });
    }
  }

  function compactPageCopy() {
    document.querySelectorAll('.page-intro').forEach((intro) => {
      intro.querySelectorAll('.eyebrow, p').forEach((node) => {
        node.setAttribute('aria-hidden', 'true');
      });
    });
  }

  function compactVideoStepCopy() {
    if (!isVideoStep()) return;
    const heading = stepHost()?.querySelector('.card-heading');
    const paragraph = heading?.querySelector('p');
    if (!paragraph) return;
    const text = paragraph.textContent || '';
    if (text.includes('pipeline จะปรับ') || text.includes('ลำดับนี้จะถูกใช้')) {
      paragraph.textContent = 'รองรับ MP4, MOV, MKV และ WebM';
    }
  }

  function polishLiveRunningStep() {
    if (!isLiveRunningStep()) return;
    const host = stepHost();
    if (!host) return;
    host.classList.remove('np-live-running-step');
    host.classList.add('np-live-native-step');
    host.querySelectorAll('.np-live-running-shell,.np-live-running-preview,.np-live-running-status,.np-live-running-chat').forEach((node) => {
      node.classList.remove('np-live-running-shell', 'np-live-running-preview', 'np-live-running-status', 'np-live-running-chat');
    });
  }

  function isRemoteWebWorkspace() {
    return /^https?:$/i.test(window.location?.protocol || '');
  }

  function accountVideos() {
    const accounts = getAccounts();
    const id = currentAccountId();
    const account = accounts.find((item) => item.id === id) || accounts[0] || {};
    return Array.isArray(account.videoList) ? account.videoList : [];
  }

  let streamConfigPersistTimer = null;
  let lastPersistedStreamConfig = '';

  function uniqueVideoPaths(videos) {
    const paths = [];
    for (const video of Array.isArray(videos) ? videos : []) {
      const path = String(video?.path || '').trim();
      if (!path || paths.includes(path)) continue;
      paths.push(path);
    }
    return paths;
  }

  function streamConfigFromAccount(account, accountId) {
    const videoPaths = uniqueVideoPaths(account?.videoList);
    return {
      videoPaths,
      shuffleEnabled: videoPaths.length > 1 && account?.shuffleEnabled === true,
      camera: account?.camera || { zoom: 1, panX: 0, panY: 0, mirror: false },
      overlays: Array.isArray(account?.overlays) ? account.overlays.map(({ id, path, x, y, width, opacity, effect }) => ({ id, path, x, y, width, opacity, effect })) : [],
      clocks: Array.isArray(account?.clocks) ? account.clocks : [],
      texts: Array.isArray(account?.texts) ? account.texts : [],
      targetMode: account?.targetMode || 'tiktok',
      accountId,
      liveTitle: String(account?.liveTitle || '').trim() || 'Rerun LIVE',
      rtmpServer: String(account?.server || '').trim(),
      streamKey: String(account?.streamKey || '').trim(),
      loop: true,
      bitrateKbps: Number(account?.bitrate || 6000),
    };
  }

  async function persistCurrentVideoConfig() {
    if (isRemoteWebWorkspace() || !isVideoStep() || !window.rerun) return;
    const accounts = getAccounts();
    const accountId = currentAccountId();
    const account = accounts.find((item) => item.id === accountId) || accounts[0];
    if (!account) return;
    const scopedId = await scopedStreamAccountId(account.id || accountId || 'main');
    const config = streamConfigFromAccount(account, scopedId);
    const signature = JSON.stringify({
      accountId: scopedId,
      videoPaths: config.videoPaths,
      shuffleEnabled: config.shuffleEnabled,
      camera: config.camera,
      overlays: config.overlays,
      clocks: config.clocks,
      texts: config.texts,
      targetMode: config.targetMode,
      liveTitle: config.liveTitle,
      rtmpServer: config.rtmpServer,
      streamKey: config.streamKey,
      bitrateKbps: config.bitrateKbps,
    });
    if (signature === lastPersistedStreamConfig) return;
    if (!config.videoPaths.length) {
      if (typeof window.rerun.clearStreamConfig === 'function') {
        await window.rerun.clearStreamConfig(scopedId).catch(() => {});
      }
      lastPersistedStreamConfig = signature;
      return;
    }
    if (typeof window.rerun.saveStreamConfig === 'function') {
      await window.rerun.saveStreamConfig(config);
      lastPersistedStreamConfig = signature;
    }
  }

  function schedulePersistCurrentVideoConfig() {
    if (streamConfigPersistTimer) window.clearTimeout(streamConfigPersistTimer);
    streamConfigPersistTimer = window.setTimeout(() => {
      streamConfigPersistTimer = null;
      persistCurrentVideoConfig().catch((error) => console.warn('[np-live-patch] stream config persist failed', error));
    }, 500);
  }

  function hasSelectedMainVideo() {
    if (!isVideoStep() && !document.querySelector('.np-live-video-card-patched')) return false;
    if (accountVideos().some((video) => video?.path)) return true;
    const main = document.querySelector('[data-main-video]');
    if (main?.dataset.renderedPath) return true;
    if (main?.querySelector('.np-live-main-inner video[src], .np-live-main-inner video source[src]')) return true;
    return Boolean(stepHost()?.querySelector('.dropzone.has-file video[src], .video-list-item video[src]'));
  }

  function hydrateCurrentAccountVideoFromMain() {
    if (!isVideoStep()) return;
    if (accountVideos().some((video) => video?.path)) return;
    const main = document.querySelector('[data-main-video]');
    const path = main?.dataset.renderedPath || main?.querySelector('video')?.dataset?.npMediaPath || main?.querySelector('video')?.getAttribute('data-np-media-path') || '';
    if (!path) return;
    try {
      const accounts = getAccounts();
      const accountId = currentAccountId();
      const videoEl = main.querySelector('video');
      const name = main.querySelector('strong')?.textContent?.trim() || String(path).split(/[\\/]/).pop() || 'วิดีโอ';
      const video = { path, name, mediaUrl: videoEl?.currentSrc || videoEl?.getAttribute('src') || '' };
      const nextAccounts = accounts.map((account) => {
        if (account.id !== accountId) return account;
        return {
          ...account,
          videoList: [video],
          maxStep: Math.max(Number(account.maxStep || 1), 3),
        };
      });
      localStorage.setItem('rerun.accounts', JSON.stringify(nextAccounts));
      window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: JSON.stringify(nextAccounts) }));
    } catch {}
  }

  function syncMainVideoIntoAccountState(panel, accountId, mainItem, catalog) {
    if (!mainItem?.path) return;
    const video = videoByPath(catalog || [], mainItem.path);
    try {
      const accounts = getAccounts();
      let changed = false;
      const nextAccounts = accounts.map((account) => {
        if (account.id !== accountId) return account;
        const list = Array.isArray(account.videoList) ? account.videoList : [];
        if (list.some((item) => item?.path === mainItem.path)) return account;
        changed = true;
        return {
          ...account,
          videoList: [{ ...video, path: mainItem.path }, ...list.filter((item) => item?.path)],
          maxStep: Math.max(Number(account.maxStep || 1), 3),
        };
      });
      if (changed) {
        localStorage.setItem('rerun.accounts', JSON.stringify(nextAccounts));
        window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: JSON.stringify(nextAccounts) }));
      }
    } catch {}
  }

  function unlockVideoStepNextButton() {
    if (!hasSelectedMainVideo()) return;
    hydrateCurrentAccountVideoFromMain();
    document.querySelectorAll('.np-live-video-queue [data-queue-list] > .clip-warning').forEach((warning) => {
      if ((warning.textContent || '').includes('ยังไม่มีวิดีโอถัดไป')) warning.remove();
    });
  }

  async function videoCatalog() {
    const byPath = new Map();
    try {
      const library = await window.rerun.listLibrary();
      for (const video of Array.isArray(library) ? library : []) {
        if (video?.path) byPath.set(video.path, video);
      }
    } catch {}
    return [...byPath.values()];
  }

  function videoName(video) {
    return video?.name || String(video?.path || '').split(/[\\/]/).pop() || 'วิดีโอ';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[char]));
  }

  function videoByPath(catalog, path) {
    return catalog.find((video) => video.path === path) || { path, name: String(path).split(/[\\/]/).pop() || path, mediaUrl: '' };
  }

  function mergeVideosByPath(...lists) {
    const byPath = new Map();
    lists.flat().forEach((video) => {
      if (!video?.path) return;
      const current = byPath.get(video.path) || {};
      byPath.set(video.path, {
        ...current,
        ...video,
        mediaUrl: video.mediaUrl || current.mediaUrl || '',
        name: video.name || current.name || String(video.path).split(/[\\/]/).pop() || 'วิดีโอ',
      });
    });
    return [...byPath.values()];
  }

  function scheduleQueueItems(schedule, fallbackPaths = []) {
    const items = Array.isArray(schedule.videoQueueItems) && schedule.videoQueueItems.length
      ? schedule.videoQueueItems
      : (Array.isArray(schedule.videoQueuePaths) && schedule.videoQueuePaths.length ? schedule.videoQueuePaths : fallbackPaths)
        .map((path) => ({
          path,
          liveHours: schedule.liveHours,
          liveMinutes: schedule.liveMinutes,
          restMinutes: schedule.restMinutes,
        }));
    return items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        path: item.path || '',
        liveHours: clampNumber(item.liveHours, schedule.liveHours, 0, 23),
        liveMinutes: clampNumber(item.liveMinutes, schedule.liveMinutes, 0, 59),
        restMinutes: clampNumber(item.restMinutes, schedule.restMinutes, 0, 1440),
      }));
  }

  function saveQueueItems(panel, accountId, items, options = {}) {
    const cleaned = items.filter((item) => item.path);
    if (cleaned.length) setMainVideoCleared(accountId, false);
    const keepMainEmpty = !cleaned.length && (options.keepMainEmpty === true || isMainVideoCleared(accountId));
    try {
      const accounts = getAccounts();
      const catalog = panel.__npCatalog || [];
      const nextAccounts = accounts.map((account) => {
        if (account.id !== accountId) return account;
        const existingVideos = Array.isArray(account.videoList) ? account.videoList : [];
        const queueVideos = cleaned.map((item) => videoByPath(catalog, item.path));
        const videoList = keepMainEmpty
          ? []
          : options.replaceAccountVideos
          ? queueVideos.filter((video) => video.path)
          : mergeVideosByPath(queueVideos, existingVideos);
        return {
          ...account,
          step: Number(account.step || 1) === 3 && !videoList.length ? 2 : account.step,
          videoList,
          maxStep: Math.max(Number(account.maxStep || 1), videoList.length ? 3 : 1),
        };
      });
      localStorage.setItem('rerun.accounts', JSON.stringify(nextAccounts));
      window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: JSON.stringify(nextAccounts) }));
    } catch {}
    saveSchedule(panel, accountId, {
      videoQueueItems: cleaned,
      videoQueuePaths: cleaned.map((item) => item.path),
    }, { silent: true });
    schedulePersistCurrentVideoConfig();
    renderVideoQueuePanel(panel, accountId);
    window.setTimeout(unlockVideoStepNextButton, 0);
  }

  function clearAccountVideosNow(accountId) {
    try {
      const accounts = getAccounts();
      let changed = false;
      const nextAccounts = accounts.map((account) => {
        if (account.id !== accountId) return account;
        changed = true;
        return {
          ...account,
          step: Number(account.step || 1) === 3 ? 2 : account.step,
          videoList: [],
          videoQueuePaths: [],
          videoQueueItems: [],
          maxStep: Math.max(1, Math.min(Number(account.maxStep || 1), 2)),
        };
      });
      if (!changed) return;
      localStorage.setItem('rerun.accounts', JSON.stringify(nextAccounts));
      window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: JSON.stringify(nextAccounts) }));
    } catch {}
  }

  function renderMainVideoEmpty(button) {
    const main = button?.closest?.('[data-main-video]') || document.querySelector('[data-main-video]');
    if (!main) return;
    main.dataset.renderedPath = '';
    main.innerHTML = `
      <div class="np-live-main-frame is-empty">
        <div class="np-live-main-empty">
          <span class="np-live-main-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 5.5h10.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"></path>
              <path d="m17.2 10 3.8-2.2v8.4L17.2 14"></path>
              <path d="M8 9.5v5l4-2.5-4-2.5Z"></path>
            </svg>
          </span>
          <strong class="np-live-main-empty-title">ยังไม่ได้เลือกวิดีโอหลัก</strong>
          <small class="np-live-main-empty-help">เลือกวิดีโอจากคลังเพื่อใช้เป็นวิดีโอรอบแรกของบัญชีนี้</small>
          <span class="np-live-main-empty-pill">กดเพื่อเลือกจากคลังวิดีโอ</span>
        </div>
      </div>
      <button class="np-live-queue-pick" type="button" data-pick-main>เลือกวิดีโอหลัก</button>
    `;
    const panel = resolveMainVideoPanel(main);
    const accountId = panel?.dataset?.accountId || currentAccountId();
    main.querySelector('.np-live-main-frame')?.addEventListener('click', () => {
      const targetPanel = resolveMainVideoPanel(main);
      if (targetPanel) openQueuePicker(targetPanel, targetPanel.dataset.accountId || accountId, 'main');
    });
    main.querySelector('[data-pick-main]')?.addEventListener('click', () => {
      const targetPanel = resolveMainVideoPanel(main);
      if (targetPanel) openQueuePicker(targetPanel, targetPanel.dataset.accountId || accountId, 'main');
    });
  }

  function removeMainVideoFromPanel(panel, accountId) {
    if (!panel) return;
    setMainVideoCleared(accountId, true);
    clearAccountVideosNow(accountId);
    const schedule = { ...DEFAULT_SCHEDULE, ...(panel.__npSchedule || {}) };
    const catalogPaths = new Set((panel.__npCatalog || []).map((video) => video.path));
    const queue = scheduleQueueItems(schedule, [])
      .filter((item) => !item.path || !catalogPaths.size || catalogPaths.has(item.path));
    const nextQueue = queue.slice(1);
    if (nextQueue.length === 0) {
      void clearMainVideoEverywhere(accountId);
    } else {
      setMainVideoCleared(accountId, false);
    }
    saveQueueItems(panel, accountId, nextQueue, { replaceAccountVideos: true, keepMainEmpty: nextQueue.length === 0 });
  }

  function resolveMainVideoPanel(button) {
    const host = button?.closest?.('.step-content') || stepHost();
    return host?.querySelector?.('.np-live-video-queue')
      || document.querySelector('.np-live-video-queue');
  }

  function handleMainVideoRemoveClick(event, button) {
    const target = button || event?.target?.closest?.('[data-remove-main]');
    if (!target) return false;
    const panel = resolveMainVideoPanel(target);
    if (!panel) return false;
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    renderMainVideoEmpty(target);
    removeMainVideoFromPanel(panel, panel.dataset.accountId || currentAccountId());
    return true;
  }

  function bindMainVideoRemoveButtons() {
    document.querySelectorAll('[data-remove-main]').forEach((button) => {
      if (button.dataset.npRemoveBound === '1') return;
      button.dataset.npRemoveBound = '1';
      button.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
      }, true);
      button.addEventListener('pointerup', (event) => handleMainVideoRemoveClick(event, button), true);
      button.addEventListener('mousedown', (event) => handleMainVideoRemoveClick(event, button), true);
      button.addEventListener('click', (event) => handleMainVideoRemoveClick(event, button), true);
      button.onclick = (event) => handleMainVideoRemoveClick(event, button);
    });
  }

  function openMainVideoPickerFromAnyVideoTarget(target) {
    const host = target?.closest?.('.step-content') || stepHost();
    if (!host) return false;
    let panel = host.querySelector('.np-live-video-queue') || document.querySelector('.np-live-video-queue');
    if (!panel) {
      injectVideoQueuePanel();
      panel = host.querySelector('.np-live-video-queue') || document.querySelector('.np-live-video-queue');
    }
    if (!panel) return false;
    openQueuePicker(panel, panel.dataset.accountId || currentAccountId(), 'main');
    return true;
  }

  function interceptVideoFileDropzonePicker() {
    if (!isVideoStep()) return;
    const host = stepHost();
    const videoCard = host?.querySelector?.('.np-live-video-card-patched, .card');
    if (!videoCard) return;
    videoCard.querySelectorAll('.dropzone, .dropzone *, input[type="file"]').forEach((node) => {
      if (node.dataset?.npSystemPickerBound === '1') return;
      if (node.dataset) node.dataset.npSystemPickerBound = '1';
      node.addEventListener('click', (event) => {
        const target = event.currentTarget || event.target;
        if (!openMainVideoPickerFromAnyVideoTarget(target)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }, true);
      node.addEventListener('pointerdown', (event) => {
        if (!openMainVideoPickerFromAnyVideoTarget(event.currentTarget || event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
      }, true);
    });
  }

  function installMainVideoRemoveDelegation() {
    if (document.documentElement.dataset.npMainVideoRemoveDelegated === '1') return;
    document.documentElement.dataset.npMainVideoRemoveDelegated = '1';
    document.addEventListener('click', (event) => {
      handleMainVideoRemoveClick(event);
    }, true);
  }

  function scheduleSummary(schedule) {
    return schedule?.enabled ? 'บันทึกแล้ว' : 'ไม่พร้อมใช้งาน';
  }

  function clampNumber(value, fallback, min, max) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function readOptionalNumber(value, fallback, min, max) {
    if (value === '' || value === null || value === undefined) return 0;
    return clampNumber(value, fallback, min, max);
  }

  function normalizeLegacyScheduleDefaults(schedule) {
    return { ...DEFAULT_SCHEDULE, ...(schedule || {}) };
  }

  function scheduleStorageKey(accountId) {
    return `np.streamSchedule.${accountId || 'main'}`;
  }

  function mainVideoClearedKey(accountId) {
    return `np.mainVideoCleared.${accountId || 'main'}`;
  }

  function isMainVideoCleared(accountId) {
    try {
      return localStorage.getItem(mainVideoClearedKey(accountId)) === '1';
    } catch {
      return false;
    }
  }

  function setMainVideoCleared(accountId, cleared) {
    try {
      if (cleared) localStorage.setItem(mainVideoClearedKey(accountId), '1');
      else localStorage.removeItem(mainVideoClearedKey(accountId));
    } catch {}
  }

  async function clearMainVideoEverywhere(accountId) {
    setMainVideoCleared(accountId, true);
    lastPersistedStreamConfig = '';
    if (isRemoteWebWorkspace()) return;
    try {
      const scopedId = await scopedStreamAccountId(accountId || 'main');
      if (typeof window.rerun?.clearStreamConfig === 'function') {
        await window.rerun.clearStreamConfig(scopedId);
      } else {
        await invokeNp('stream:clear-config', [scopedId]).catch(() => {});
      }
    } catch (error) {
      console.warn('[np-live-patch] clear main video failed', error);
    }
  }

  function readScheduleCache(accountId) {
    try {
      const cached = JSON.parse(localStorage.getItem(scheduleStorageKey(accountId)) || 'null');
      return cached && typeof cached === 'object' ? cached : null;
    } catch {
      return null;
    }
  }

  function writeScheduleCache(accountId, schedule) {
    try {
      localStorage.setItem(scheduleStorageKey(accountId), JSON.stringify({ ...schedule, savedAt: Date.now() }));
    } catch {}
  }

  function timeInputValue(value, fallback, max) {
    const number = clampNumber(value, fallback, 0, max);
    return number === 0 ? '' : String(number).padStart(2, '0');
  }

  function scheduleFromInputs(panel, enabled = panel.__npSchedule?.enabled === true) {
    return {
      enabled,
      liveHours: readOptionalNumber(panel.querySelector('[data-live-hours]')?.value, 0, 0, 23),
      liveMinutes: readOptionalNumber(panel.querySelector('[data-live-minutes]')?.value, 0, 0, 59),
      restMinutes: readOptionalNumber(panel.querySelector('[data-rest-minutes]')?.value, 0, 0, 1440),
    };
  }

  function updateScheduleStatusFromInputs(panel) {
    const status = panel.querySelector('[data-status]');
    if (!status) return;
    status.textContent = scheduleSummary(scheduleFromInputs(panel));
  }

  async function loadSchedule(panel, accountId) {
    const bridge = window.rerun;
    const schedule = !isRemoteWebWorkspace() && bridge?.getStreamSchedule
      ? await bridge.getStreamSchedule(accountId).catch(() => DEFAULT_SCHEDULE)
      : DEFAULT_SCHEDULE;
    panel.__npSchedule = normalizeLegacyScheduleDefaults({ ...schedule, ...(readScheduleCache(accountId) || {}) });
    renderSchedulePanel(panel, accountId);
  }

  async function saveSchedule(panel, accountId, patch = {}, options = {}) {
    const bridge = window.rerun;
    const schedule = { ...(panel.__npSchedule || DEFAULT_SCHEDULE), ...patch };
    panel.__npSchedule = schedule;
    writeScheduleCache(accountId, schedule);
    if (options.render !== false) renderSchedulePanel(panel, accountId);
    if (isRemoteWebWorkspace()) return;
    if (!bridge?.setStreamSchedule) {
      if (!options.silent) notify('ฟีเจอร์ตั้งเวลาต้องรีสตาร์ตแอปก่อนถึงจะใช้ได้', 'warning');
      return;
    }
    try {
      const saved = await bridge.setStreamSchedule(accountId, schedule);
      panel.__npSchedule = { ...DEFAULT_SCHEDULE, ...saved };
      writeScheduleCache(accountId, panel.__npSchedule);
      if (options.render !== false) renderSchedulePanel(panel, accountId);
      if (options.render !== false && panel.classList.contains('np-live-video-queue')) renderVideoQueuePanel(panel, accountId);
      if (!options.silent) notify(options.message || 'บันทึกการตั้งเวลาแล้ว', 'success');
    } catch (error) {
      if (!options.silent) notify(error instanceof Error ? error.message : String(error), 'danger');
    }
  }

  function queueItemsFromInputs(panel, queue) {
    return queue.map((item, index) => {
      if (!item?.path || index === 0) return item;
      return {
        ...item,
        liveHours: readOptionalNumber(panel.querySelector(`[data-row-hours="${index}"]`)?.value, 0, 0, 23),
        liveMinutes: readOptionalNumber(panel.querySelector(`[data-row-minutes="${index}"]`)?.value, 0, 0, 59),
        restMinutes: readOptionalNumber(panel.querySelector(`[data-row-rest="${index}"]`)?.value, 0, 0, 1440),
      };
    }).filter(Boolean);
  }

  function saveQueueTimesFromInputs(panel, accountId, queue, options = {}) {
    const next = queueItemsFromInputs(panel, queue);
    const patch = {
      videoQueueItems: next,
      videoQueuePaths: next.map((item) => item.path).filter(Boolean),
    };
    panel.__npSchedule = { ...(panel.__npSchedule || DEFAULT_SCHEDULE), ...patch };
    writeScheduleCache(accountId, panel.__npSchedule);
    saveSchedule(panel, accountId, patch, { silent: true, render: options.render === true });
  }

  function renderSchedulePanel(panel, accountId) {
    const schedule = { ...DEFAULT_SCHEDULE, ...(panel.__npSchedule || {}) };
    if (!panel.querySelector('[data-live-hours]')) return;
    panel.querySelector('[data-live-hours]').value = timeInputValue(schedule.liveHours, 0, 23);
    panel.querySelector('[data-live-minutes]').value = timeInputValue(schedule.liveMinutes, 0, 59);
    panel.querySelector('[data-rest-minutes]').value = timeInputValue(schedule.restMinutes, 0, 1440);
    const toggle = panel.querySelector('[data-enabled]');
    toggle.classList.toggle('on', schedule.enabled);
    toggle.setAttribute('aria-checked', String(schedule.enabled));
    panel.querySelector('[data-status]').textContent = scheduleSummary(schedule);
  }

  function renderQueueTime(panel) {
    const schedule = { ...DEFAULT_SCHEDULE, ...(panel.__npSchedule || {}) };
    const liveHours = panel.querySelector('[data-queue-live-hours]');
    if (!liveHours) return;
    panel.querySelector('[data-queue-live-hours]').value = timeInputValue(schedule.liveHours, 0, 23);
    panel.querySelector('[data-queue-live-minutes]').value = timeInputValue(schedule.liveMinutes, 0, 59);
    panel.querySelector('[data-queue-rest-minutes]').value = timeInputValue(schedule.restMinutes, 0, 1440);
    panel.querySelector('[data-queue-time-status]').textContent = scheduleSummary(schedule);
  }

  function injectSchedulePanel() {
    const host = stepHost();
    if (!isScheduleStep()) {
      document.querySelector('.np-live-schedule-card')?.remove();
      return;
    }
    if (!host || document.querySelector('.np-live-schedule-card')) return;
    const videoCard = host.querySelector('.np-live-video-card-patched');
    const mainPanel = videoCard?.querySelector('[data-main-video]');
    if (!videoCard || !mainPanel) return;
    const accountId = currentAccountId();
    const panel = document.createElement('section');
    panel.className = 'card np-live-extra-card np-live-schedule-card';
    panel.dataset.accountId = accountId;
    panel.innerHTML = `
      <div class="card-heading">
        <div>
          <h2>ขึ้น–ลงไลฟ์สดอัตโนมัติ</h2>
        </div>
        <button class="toggle" type="button" role="switch" aria-checked="false" data-enabled><span></span></button>
      </div>
      <div class="np-live-schedule-grid">
        <label class="np-live-number">
          <span>ลงไลฟ์สดหลังจาก (ชม.)</span>
          <input class="text-input mono" type="number" inputmode="numeric" min="0" max="23" step="1" data-live-hours value="">
        </label>
        <label class="np-live-number">
          <span>นาที</span>
          <input class="text-input mono" type="number" inputmode="numeric" min="0" max="59" step="1" data-live-minutes value="">
        </label>
        <label class="np-live-number">
          <span>รอก่อนขึ้นใหม่ (นาที)</span>
          <input class="text-input mono" type="number" inputmode="numeric" min="0" max="1440" step="1" data-rest-minutes value="">
        </label>
      </div>
      <div class="np-live-status">
        <span>สถานะ</span>
        <strong data-status>กำลังโหลด...</strong>
      </div>
    `;
    mainPanel.after(panel);
    panel.querySelector('[data-enabled]').addEventListener('click', () => {
      const nextEnabled = !panel.__npSchedule?.enabled;
      saveSchedule(panel, panel.dataset.accountId, scheduleFromInputs(panel, nextEnabled), {
        message: nextEnabled ? 'เปิดการขึ้น-ลงไลฟ์สดอัตโนมัติแล้ว' : 'ปิดการขึ้น-ลงไลฟ์สดอัตโนมัติแล้ว',
      });
    });
    panel.querySelectorAll('[data-live-hours], [data-live-minutes], [data-rest-minutes]').forEach((input) => {
      const persist = () => {
        const schedule = scheduleFromInputs(panel);
        panel.__npSchedule = { ...(panel.__npSchedule || DEFAULT_SCHEDULE), ...schedule };
        writeScheduleCache(panel.dataset.accountId, panel.__npSchedule);
        updateScheduleStatusFromInputs(panel);
        window.clearTimeout(panel.__npScheduleSaveTimer);
        panel.__npScheduleSaveTimer = window.setTimeout(() => {
          saveSchedule(panel, panel.dataset.accountId, scheduleFromInputs(panel), { silent: true, render: false });
        }, 250);
      };
      input.addEventListener('input', persist);
      input.addEventListener('change', () => {
        persist();
        saveSchedule(panel, panel.dataset.accountId, scheduleFromInputs(panel), { silent: true, render: false });
      });
    });
    loadSchedule(panel, accountId);
  }

  async function renderVideoQueuePanel(panel, accountId) {
    const schedule = { ...DEFAULT_SCHEDULE, ...(panel.__npSchedule || {}) };
    const catalog = await videoCatalog();
    panel.__npCatalog = catalog;
    const fallbackQueue = accountVideos().map((video) => video.path).filter(Boolean);
    const catalogPaths = new Set(catalog.map((video) => video.path));
    const queue = scheduleQueueItems(schedule, fallbackQueue)
      .filter((item) => !item.path || !catalogPaths.size || catalogPaths.has(item.path));
    const emptySlots = Math.max(0, Number(panel.__npEmptySlots || 0));
    let mainCleared = isMainVideoCleared(accountId);
    if (mainCleared && queue.some((item) => item?.path)) {
      setMainVideoCleared(accountId, false);
      mainCleared = false;
    }
    const mainItem = mainCleared ? null : queue[0] || null;
    syncMainVideoIntoAccountState(panel, accountId, mainItem, catalog);
    const rows = [...queue.slice(1), ...Array(emptySlots).fill(null)];
    const filledRows = rows.filter((item) => item?.path).length;
    panel.classList.toggle('is-empty', rows.length === 0);
    const count = panel.querySelector('[data-queue-count]');
    if (count) count.textContent = mainItem?.path
      ? `วิดีโอหลัก 1 คลิป${rows.length ? ` · วิดีโอถัดไป ${filledRows}/${rows.length}` : ''}`
      : rows.length ? `${filledRows}/${rows.length} วิดีโอถัดไป` : 'ยังไม่มีวิดีโอถัดไป';
    const main = panel.parentElement?.querySelector('[data-main-video]');
    if (main) {
      const nextMainKey = mainItem?.path || '';
      if (main.dataset.renderedPath !== nextMainKey) {
        main.dataset.renderedPath = nextMainKey;
        if (mainItem?.path) {
        const video = videoByPath(catalog, mainItem.path);
        main.innerHTML = `
          <div class="np-live-main-frame">
            <div class="np-live-main-inner">
              <button class="np-live-main-delete" type="button" data-remove-main title="ลบวิดีโอหลัก">×</button>
              <video src="${escapeHtml(video.mediaUrl || '')}" data-np-media-path="${escapeHtml(video.path || mainItem.path)}" controls muted playsinline title="${escapeHtml(videoName(video))}"></video>
            </div>
          </div>
          <button class="np-live-queue-pick" type="button" data-pick-main>เปลี่ยนวิดีโอหลักจากคลังวิดีโอ</button>
        `;
        } else {
        main.innerHTML = `
          <div class="np-live-main-frame is-empty">
            <div class="np-live-main-empty">
              <span class="np-live-main-empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M5 5.5h10.2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"></path>
                  <path d="m17.2 10 3.8-2.2v8.4L17.2 14"></path>
                  <path d="M8 9.5v5l4-2.5-4-2.5Z"></path>
                </svg>
              </span>
              <strong class="np-live-main-empty-title">ยังไม่ได้เลือกวิดีโอหลัก</strong>
              <small class="np-live-main-empty-help">เลือกวิดีโอจากคลังเพื่อใช้เป็นวิดีโอรอบแรกของบัญชีนี้</small>
              <span class="np-live-main-empty-pill">กดเพื่อเลือกจากคลังวิดีโอ</span>
            </div>
          </div>
          <button class="np-live-queue-pick" type="button" data-pick-main>เลือกวิดีโอหลัก</button>
        `;
        }
        main.querySelector('.np-live-main-frame')?.addEventListener('click', (event) => {
          if (event.target instanceof HTMLElement && event.target.closest('[data-remove-main], video')) return;
          openQueuePicker(panel, accountId, 'main');
        });
        main.querySelector('[data-pick-main]')?.addEventListener('click', () => openQueuePicker(panel, accountId, 'main'));
        main.querySelector('[data-remove-main]')?.addEventListener('click', () => {
          removeMainVideoFromPanel(panel, accountId);
        });
      }
    }
    const list = panel.querySelector('[data-queue-list]');
    const rowsSignature = JSON.stringify(rows.map((item) => item?.path || ''));
    if (list.dataset.renderedRows === rowsSignature) return;
    list.dataset.renderedRows = rowsSignature;
    list.innerHTML = rows.map((item, rowIndex) => {
      const index = rowIndex + 1;
      const labelIndex = rowIndex + 1;
      if (!item?.path) {
        const label = `วิดีโอถัดไป ${labelIndex}`;
        return `<div class="np-live-queue-item empty">
          <button class="np-live-queue-add-chip" type="button" data-pick-slot="${index}">เพิ่ม</button>
          <div><small>${label}</small><strong>ยังไม่ได้เลือกวิดีโอ</strong></div>
          <label class="np-live-queue-cell"><span>ลงหลัง (ชม.)</span><input class="text-input mono" type="number" min="0" max="23" step="1" value="" data-row-hours="${index}"></label>
          <label class="np-live-queue-cell"><span>นาที</span><input class="text-input mono" type="number" min="0" max="59" step="1" value="" data-row-minutes="${index}"></label>
          <label class="np-live-queue-cell"><span>รอก่อนขึ้นใหม่</span><input class="text-input mono" type="number" min="0" max="1440" step="1" value="" data-row-rest="${index}"></label>
          <div class="np-live-queue-actions">
            <button class="icon-button danger" type="button" data-remove-empty="${index}" title="ลบ">×</button>
          </div>
        </div>`;
      }
      const video = videoByPath(catalog, item.path);
      const label = `วิดีโอถัดไป ${labelIndex}`;
      const mediaUrl = escapeHtml(video.mediaUrl || '');
      const name = escapeHtml(videoName(video));
      const hours = timeInputValue(item.liveHours, 0, 23);
      const minutes = timeInputValue(item.liveMinutes, 0, 59);
      const rest = timeInputValue(item.restMinutes, 0, 1440);
      return `<div class="np-live-queue-item">
        <video src="${mediaUrl}" controls muted playsinline></video>
        <div><small>${label}</small><strong>${name}</strong></div>
        <label class="np-live-queue-cell"><span>ลงหลัง (ชม.)</span><input class="text-input mono" type="number" min="0" max="23" step="1" value="${hours}" data-row-hours="${index}"></label>
        <label class="np-live-queue-cell"><span>นาที</span><input class="text-input mono" type="number" min="0" max="59" step="1" value="${minutes}" data-row-minutes="${index}"></label>
        <label class="np-live-queue-cell"><span>รอก่อนขึ้นใหม่</span><input class="text-input mono" type="number" min="0" max="1440" step="1" value="${rest}" data-row-rest="${index}"></label>
        <div class="np-live-queue-actions">
          <button class="np-live-queue-pick" type="button" data-pick-slot="${index}">เปลี่ยน</button>
          <button class="icon-button" type="button" data-up="${index}" title="เลื่อนขึ้น">↑</button>
          <button class="icon-button" type="button" data-down="${index}" title="เลื่อนลง">↓</button>
          <button class="icon-button danger" type="button" data-remove="${index}" title="ลบ">×</button>
        </div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-row-hours], [data-row-minutes], [data-row-rest]').forEach((input) => {
      const persist = () => {
        const index = Number(input.dataset.rowHours ?? input.dataset.rowMinutes ?? input.dataset.rowRest);
        if (!queue[index]) return;
        saveQueueTimesFromInputs(panel, accountId, queue, { render: false });
        window.clearTimeout(panel.__npQueueTimeSaveTimer);
        panel.__npQueueTimeSaveTimer = window.setTimeout(() => {
          saveQueueTimesFromInputs(panel, accountId, queue, { render: false });
        }, 250);
      };
      input.addEventListener('input', persist);
      input.addEventListener('change', () => {
        persist();
        saveQueueTimesFromInputs(panel, accountId, queue, { render: false });
      });
    });
    list.querySelectorAll('[data-pick-slot]').forEach((button) => button.addEventListener('click', () => {
      openQueuePicker(panel, accountId, Number(button.dataset.pickSlot));
    }));
    list.querySelectorAll('[data-up]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.up);
      if (index <= 1) return;
      const next = [...queue];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      saveQueueItems(panel, accountId, next, { replaceAccountVideos: true });
    }));
    list.querySelectorAll('[data-down]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.down);
      if (index >= queue.length - 1) return;
      const next = [...queue];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      saveQueueItems(panel, accountId, next, { replaceAccountVideos: true });
    }));
    list.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.remove);
      saveQueueItems(panel, accountId, queue.filter((_, i) => i !== index), { replaceAccountVideos: true });
    }));
    list.querySelectorAll('[data-remove-empty]').forEach((button) => button.addEventListener('click', () => {
      panel.__npEmptySlots = Math.max(0, Number(panel.__npEmptySlots || 0) - 1);
      renderVideoQueuePanel(panel, accountId);
    }));
  }

  async function openQueuePicker(panel, accountId, slotIndex = null) {
    const catalog = await videoCatalog();
    if (!catalog.length) {
      notify('ยังไม่มีวิดีโอในคลังวิดีโอ ให้เพิ่มที่เมนูคลังวิดีโอก่อนค่ะ', 'warning');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'np-live-picker-backdrop';
    wrap.innerHTML = `<section class="np-live-picker">
      <div class="np-live-picker-head">
        <div><span class="eyebrow">คลังวิดีโอ</span><h2>เลือกวิดีโอจากระบบ</h2><p>เลือกไฟล์ READY ที่จะใช้ขึ้นไลฟ์ วิดีโอเล่นดูได้ในกล่องนี้</p></div>
        <div class="np-live-picker-head-actions"><span class="np-live-picker-count">${catalog.length} วิดีโอพร้อมเล่น</span><button class="np-live-picker-close" type="button" data-close>ปิด</button></div>
      </div>
      <div class="np-live-picker-list"></div>
    </section>`;
    const list = wrap.querySelector('.np-live-picker-list');
    list.innerHTML = catalog.map((video) => {
      const name = videoName(video);
      const rawId = String(video.id || video.path || name);
      const id = rawId.split(/[\\/]/).pop() || name;
      return `<article class="np-live-picker-card" tabindex="0" role="button" data-pick="${escapeHtml(video.path)}">
        <div class="np-live-picker-preview">
          <span class="np-live-picker-ready">READY</span>
          <video src="${escapeHtml(video.mediaUrl || '')}" controls muted playsinline preload="metadata"></video>
        </div>
        <div class="np-live-picker-title">
          <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
          <small>ID: ${escapeHtml(id)}</small>
        </div>
        <div class="np-live-picker-meta">
          <div><span>ขนาดไฟล์</span><b>${escapeHtml(formatBytes(video.size || 0))}</b></div>
          <div><span>เวลา</span><b>-</b></div>
          <div class="np-live-picker-select">✓</div>
          <button class="np-live-picker-select-button" type="button" data-select-video>เลือกวิดีโอนี้</button>
        </div>
      </article>`;
    }).join('');
    wrap.querySelector('[data-close]').addEventListener('click', () => wrap.remove());
    list.querySelectorAll('[data-pick]').forEach((card) => {
      const pick = () => {
      const schedule = { ...DEFAULT_SCHEDULE, ...(panel.__npSchedule || {}) };
      const catalogPaths = new Set(catalog.map((video) => video.path));
      const fallback = accountVideos().map((video) => video.path).filter((path) => catalogPaths.has(path));
      const base = scheduleQueueItems(schedule, fallback).filter((item) => item.path && catalogPaths.has(item.path));
      const next = [...base];
      const liveHours = readOptionalNumber(panel.querySelector(`[data-row-hours="${slotIndex}"]`)?.value, 0, 0, 23);
      const liveMinutes = readOptionalNumber(panel.querySelector(`[data-row-minutes="${slotIndex}"]`)?.value, 0, 0, 59);
      const restMinutes = readOptionalNumber(panel.querySelector(`[data-row-rest="${slotIndex}"]`)?.value, 0, 0, 1440);
      const item = { path: card.dataset.pick, liveHours, liveMinutes, restMinutes };
      if (slotIndex === 'main') {
        setMainVideoCleared(accountId, false);
        next[0] = item;
      }
      else if (Number.isInteger(slotIndex) && slotIndex >= 0) next[slotIndex] = item;
      else next.push(item);
      panel.__npEmptySlots = Math.max(0, Number(panel.__npEmptySlots || 0) - 1);
      saveQueueItems(panel, accountId, next.filter(Boolean), { replaceAccountVideos: true });
      wrap.remove();
      };
      card.addEventListener('click', (event) => {
        if (event.target?.closest?.('video')) return;
        if (event.target?.closest?.('[data-select-video]')) return;
        pick();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        pick();
      });
      card.querySelector('[data-select-video]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        pick();
      });
    });
    document.body.append(wrap);
  }

  function injectVideoQueuePanel() {
    const host = stepHost();
    if (!isVideoStep()) {
      document.querySelector('.np-live-video-queue')?.remove();
      return;
    }
    const videoCard = host?.querySelector('.card');
    if (!host || !videoCard || document.querySelector('.np-live-video-queue')) return;
    const accountId = currentAccountId();
    const panel = document.createElement('section');
    panel.className = 'np-live-extra-card np-live-video-queue';
    panel.dataset.accountId = accountId;
    panel.innerHTML = `<div class="card-heading">
      <div><h2>วิดีโอถัดไป</h2></div>
      <div class="np-live-queue-head-actions"><span class="np-live-queue-count" data-queue-count>ยังไม่มีวิดีโอถัดไป</span><button class="ghost-button" type="button" data-add-queue>+ เพิ่มวิดีโอ</button></div>
    </div>
    <div class="np-live-queue-grid">
      <div class="np-live-queue-table" data-queue-list></div>
    </div>`;
    videoCard.classList.add('np-live-video-card-patched');
    const mainPanel = document.createElement('div');
    mainPanel.className = 'np-live-main-video';
    mainPanel.dataset.mainVideo = 'true';
    videoCard.querySelector('.card-heading')?.after(mainPanel);
    videoCard.append(panel);
    panel.querySelector('[data-add-queue]').addEventListener('click', () => {
      panel.__npEmptySlots = Number(panel.__npEmptySlots || 0) + 1;
      renderVideoQueuePanel(panel, panel.dataset.accountId);
    });
    loadSchedule(panel, accountId).then(() => renderVideoQueuePanel(panel, accountId));
  }

  function syncScheduleAccount() {
    const accountId = currentAccountId();
    document.querySelectorAll('.np-live-schedule-card, .np-live-video-queue').forEach((panel) => {
      if (panel.dataset.accountId === accountId) return;
      panel.dataset.accountId = accountId;
      loadSchedule(panel, accountId).then(() => {
        if (panel.classList.contains('np-live-video-queue')) renderVideoQueuePanel(panel, accountId);
      });
    });
  }

  function compactConnectTikTokStep() {
    const host = stepHost();
    if (!host || !isConnectTikTokStep()) return;
    host.classList.add('np-live-connect-step');
    const cards = Array.from(host.children).filter((node) => node.classList?.contains('card'));
    cards.forEach((card) => {
      const text = card.textContent || '';
      card.classList.toggle('np-live-connect-main', text.includes('เชื่อม TikTok Streamer Desktop'));
      card.classList.toggle('np-live-pin-card', text.includes('ปักสินค้าอัตโนมัติ'));
    });
    const panels = [
      { card: cards.find((card) => (card.textContent || '').includes('เชื่อม TikTok Streamer Desktop')), key: 'connect-main', number: '1', title: 'เชื่อม TikTok Streamer Desktop' },
      { card: cards.find((card) => (card.textContent || '').includes('ทดสอบคำตอบก่อนปล่อยจริง')), key: 'ai-test', number: '2', title: 'ทดสอบคำตอบก่อนปล่อยจริง' },
      { card: cards.find((card) => (card.textContent || '').includes('ระบบตอบแชทตอน')), key: 'chatbot', number: '3', title: 'ระบบตอบแชทอัตโนมัติ' },
      { card: cards.find((card) => (card.textContent || '').includes('ปักสินค้าอัตโนมัติ')), key: 'pin-products', number: '4', title: 'ปักสินค้าอัตโนมัติ' },
    ].filter((item) => item.card);
    const setClass = (node, className, enabled) => {
      if (node.classList.contains(className) !== enabled) node.classList.toggle(className, enabled);
    };
    const setText = (node, value) => {
      if (node && node.textContent !== value) node.textContent = value;
    };
    panels.forEach(({ card, key, number, title }) => {
      if (!card.classList.contains('np-live-connect-panel')) card.classList.add('np-live-connect-panel');
      if (card.dataset.npAccordionKey !== key) card.dataset.npAccordionKey = key;
      let toggle = card.querySelector(':scope > .np-live-accordion-toggle');
      if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'np-live-accordion-toggle';
        toggle.innerHTML = `
          <span class="np-live-accordion-title">
            <span class="np-live-accordion-no">${number}</span>
            <span class="np-live-accordion-text">${title}</span>
          </span>
          <span class="np-live-accordion-state" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
          </span>
        `;
        card.prepend(toggle);
        toggle.addEventListener('click', () => {
          const collapsed = !card.classList.contains('is-collapsed');
          setClass(card, 'is-collapsed', collapsed);
          localStorage.setItem(`npLiveConnectAccordion:${key}`, collapsed ? 'closed' : 'open');
          toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
      }
      setText(toggle.querySelector('.np-live-accordion-no'), number);
      setText(toggle.querySelector('.np-live-accordion-text'), title);
      const saved = localStorage.getItem(`npLiveConnectAccordion:${key}`);
      const collapsed = saved === 'closed';
      setClass(card, 'is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }

  async function repairOverlayVideoPreview() {
    const text = activeStepText();
    if (!text.includes('จัดการ Overlay') && !document.querySelector('.portrait-stage')) return;
    const stageVideo = document.querySelector('.portrait-stage > video');
    try {
      const accountId = currentAccountId();
      const schedule = window.rerun?.getStreamSchedule
        ? await window.rerun.getStreamSchedule(accountId).catch(() => DEFAULT_SCHEDULE)
        : DEFAULT_SCHEDULE;
      const scheduledPath = scheduleQueueItems({ ...DEFAULT_SCHEDULE, ...schedule })[0]?.path || '';
      const accountVideo = accountVideos()[0];
      const targetPath = accountVideo?.path || scheduledPath || '';
      if (!targetPath) return;
      if (stageVideo?.dataset.npMediaPath === targetPath && (stageVideo.getAttribute('src') || stageVideo.currentSrc)) return;
      const catalog = await videoCatalog();
      const video = videoByPath(catalog, targetPath);
      if (!video?.mediaUrl) return;
      const accounts = getAccounts();
      const current = accounts.find((item) => item.id === accountId);
      const currentFirst = Array.isArray(current?.videoList) ? current.videoList[0] : null;
      const needsStoredRefresh = currentFirst?.path === targetPath && currentFirst.mediaUrl !== video.mediaUrl;
      if (needsStoredRefresh && !stageVideo) {
        const nextAccounts = accounts.map((account) => {
          if (account.id !== accountId) return account;
          const list = Array.isArray(account.videoList) ? account.videoList : [];
          return { ...account, videoList: list.map((item, index) => index === 0 ? { ...item, ...video } : item) };
        });
        localStorage.setItem('rerun.accounts', JSON.stringify(nextAccounts));
      }
      if (stageVideo) {
        stageVideo.dataset.npMediaPath = targetPath;
        stageVideo.src = video.mediaUrl;
        stageVideo.load();
        stageVideo.play?.().catch(() => {});
      }
    } catch {}
  }

  const dashboardSalesState = {
    loading: false,
    lastAt: 0,
    owner: '',
    records: [],
    lastWarnAt: 0,
  };

  function salesMoney(value) {
    const number = Number(value || 0);
    return Number.isFinite(number)
      ? number.toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' THB'
      : '—';
  }

  async function loadDashboardSales(force = false) {
    const now = Date.now();
    const owner = localActiveUsername().toLowerCase();
    if (dashboardSalesState.owner !== owner) {
      dashboardSalesState.owner = owner;
      dashboardSalesState.lastAt = 0;
      dashboardSalesState.records = [];
      dashboardSalesState.loading = false;
    }
    if (!force && dashboardSalesState.lastAt && now - dashboardSalesState.lastAt < 15000) {
      return dashboardSalesState.records;
    }
    if (dashboardSalesState.loading) return dashboardSalesState.records;
    dashboardSalesState.loading = true;
    dashboardSalesState.lastAt = now;
    try {
      const data = await topupFetch('/api/invoke', {
        method: 'POST',
        body: JSON.stringify({ channel: 'sales:list', args: [] }),
      });
      const records = Array.isArray(data?.result?.records) ? data.result.records : [];
      dashboardSalesState.records = records.filter((item) => Number(item?.amount || 0) > 0);
      dashboardSalesState.lastAt = Date.now();
    } catch (error) {
      dashboardSalesState.lastAt = Date.now();
      if (dashboardSalesState.lastAt - dashboardSalesState.lastWarnAt > 15000) {
        dashboardSalesState.lastWarnAt = dashboardSalesState.lastAt;
        console.warn('[np-live-patch] sales summary failed', error);
      }
    } finally {
      dashboardSalesState.loading = false;
    }
    return dashboardSalesState.records;
  }

  function patchDashboardSalesCard() {
    const dashboard = document.querySelector('.dashboard');
    if (!dashboard) return;
    const card = [...dashboard.querySelectorAll('.stat-card')].find((item) => item.textContent.includes('ยอดขายรวม'));
    if (!card) return;
    const value = card.querySelector('.stat-value');
    const label = card.querySelector('.stat-label');
    if (!value || !label) return;
    if (card.classList.contains('np-sales-ready') && Date.now() - dashboardSalesState.lastAt < 30000) return;
    const existingTotal = Number(String(value.textContent || '').replace(/[^\d.-]/g, ''));
    const hasExistingTotal = Number.isFinite(existingTotal) && existingTotal > 0 && !label.textContent.includes('ยังไม่ได้นำเข้า');
    if (hasExistingTotal) return;
    loadDashboardSales().then((records) => {
      const total = records.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      value.textContent = salesMoney(total);
      label.textContent = `ยอดขายรวมจาก CSV · ${records.length.toLocaleString('th-TH')} ออร์เดอร์`;
      card.classList.add('np-sales-ready');
    });
  }

  function formatBytes(value) {
    const size = Number(value || 0);
    if (!Number.isFinite(size) || size <= 0) return 'N/A';
    const units = ['B', 'KB', 'MB', 'GB'];
    let next = size;
    let unit = 0;
    while (next >= 1024 && unit < units.length - 1) {
      next /= 1024;
      unit += 1;
    }
    return `${next >= 100 ? next.toFixed(0) : next.toFixed(2)} ${units[unit]}`;
  }

  function formatThaiDate(value) {
    try {
      return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value || Date.now()));
    } catch {
      return '';
    }
  }

  function stripVideoExtension(name) {
    return String(name || '').replace(/\.(mp4|mov|mkv|webm|m4v)$/i, '').trim();
  }

  function isLibrarySectionActive() {
    const nav = document.querySelector('aside nav');
    const active = nav ? Array.from(nav.querySelectorAll('button.active,button.np-force-active,[aria-current="page"]')).find((button) => button.offsetParent !== null) : null;
    const activeLabel = active ? sidebarSectionFromButton(active) : '';
    if (activeLabel) return activeLabel === 'คลังวิดีโอ';
    return rememberedSidebarSection() === 'คลังวิดีโอ';
  }

  function cleanupLibraryDomOutsideLibraryPage() {
    if (isLibrarySectionActive()) return;
    document.querySelectorAll('.library-grid,[data-np-library-toolbar],[data-np-storage-package]').forEach((node) => node.remove());
    document.querySelectorAll('.library-page').forEach((node) => node.classList.remove('library-page'));
  }

  function getLibraryPage() {
    if (!isLibrarySectionActive()) {
      cleanupLibraryDomOutsideLibraryPage();
      return null;
    }
    const direct = document.querySelector('.settings-page.library-page');
    if (direct) {
      direct.classList.add('library-page');
      return direct;
    }
    const intro = Array.from(document.querySelectorAll('.page-intro.library-hero')).find((node) => (node.textContent || '').includes('คลังวิดีโอ'));
    const page = intro?.parentElement;
    if (page && page.classList.contains('settings-page')) {
      page.classList.add('library-page');
      return page;
    }
    return null;
  }

  function ensureLibraryGrid() {
    const page = getLibraryPage();
    if (!page) return null;
    let grid = page.querySelector('.library-grid');
    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'library-grid';
      const toolbar = page.querySelector('[data-np-library-toolbar]');
      const packageStrip = page.querySelector('[data-np-storage-package]');
      const anchor = toolbar || packageStrip || page.querySelector('.library-hero') || page.querySelector('.page-intro');
      if (anchor) anchor.insertAdjacentElement('afterend', grid);
      else page.append(grid);
    }
    return grid;
  }

  function libraryGrid() {
    return ensureLibraryGrid() || getLibraryPage();
  }

  function pendingUploadStore() {
    if (!window.__npPendingLibraryUploads) {
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem('np.pendingLibraryUploads') || '[]'); } catch {}
      const now = Date.now();
      window.__npPendingLibraryUploads = new Map((Array.isArray(saved) ? saved : [])
        .filter((item) => item?.uploadToken && (!item.updatedAt || now - Number(item.updatedAt) < 10 * 60 * 1000))
        .map((item) => [item.uploadToken, item]));
      persistPendingUploadStore();
    }
    return window.__npPendingLibraryUploads;
  }
  function persistPendingUploadStore() {
    try { localStorage.setItem('np.pendingLibraryUploads', JSON.stringify([...pendingUploadStore().values()].filter((item) => item && item.phase !== 'complete'))); } catch {}
  }

  async function listLibraryUploadJobs() {
    if (typeof window.__npListLibraryUploadJobs === 'function') {
      const jobs = await window.__npListLibraryUploadJobs();
      return Array.isArray(jobs) ? jobs : [];
    }
    return [];
  }

  async function cancelLibraryUploadJob(uploadToken) {
    if (typeof window.__npCancelLibraryUploadJob !== 'function') return null;
    return window.__npCancelLibraryUploadJob(uploadToken);
  }

  function updatePendingLibraryCard(card, detail = {}) {
    if (!card) return;
    const percent = Math.max(0, Math.min(100, Number(detail.percent || 0)));
    const phase = detail.phase === 'processing' ? 'กำลังบันทึกเข้าคลัง' : detail.phase === 'error' ? 'อัปโหลดไม่สำเร็จ' : 'กำลังอัปโหลดขึ้น server';
    card.querySelector('[data-upload-badge]').textContent = detail.phase === 'processing' ? 'กำลังบันทึก' : detail.phase === 'error' ? 'ผิดพลาด' : `กำลังอัปโหลด ${Math.round(percent)}%`;
    card.querySelector('[data-upload-phase]').textContent = phase;
    card.querySelector('[data-upload-percent]').textContent = `${Math.round(percent)}%`;
    card.querySelector('[data-upload-bar]').style.width = `${percent}%`;
    const detailNode = card.querySelector('[data-upload-detail]');
    if (detailNode) detailNode.textContent = '';
    card.classList.toggle('np-library-upload-error', detail.phase === 'error');
  }

  function insertPendingLibraryCard(video, name, options = {}) {
    const host = libraryGrid();
    if (!host) return () => {};
    hideLibraryEmptyState();
    const uploadToken = video?.uploadToken || '';
    const existing = uploadToken ? host.querySelector(`.np-library-pending-card[data-upload-token="${CSS.escape(uploadToken)}"]`) : null;
    if (existing) {
      updatePendingLibraryCard(existing, pendingUploadStore().get(uploadToken) || {});
      return () => existing.remove();
    }
    const card = document.createElement('div');
    card.className = 'np-library-pending-card';
    if (uploadToken) card.dataset.uploadToken = uploadToken;
    card.innerHTML = `
      <div class="np-library-pending-preview">
        <span class="np-library-uploading" data-upload-badge>กำลังรออัปโหลด</span>
        ${video?.mediaUrl ? `<video src="${escapeHtml(video.mediaUrl)}" muted playsinline preload="metadata"></video>` : ''}
      </div>
      <div class="np-library-card-body">
        <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
        <button class="icon-button danger np-library-cancel-upload" type="button" title="ยกเลิกอัปโหลด" data-cancel-upload>×</button>
        <small>วันที่อัปโหลด ${escapeHtml(formatThaiDate(Date.now()))}</small>
        <small>ขนาดไฟล์ ${escapeHtml(formatBytes(video?.size))}</small>
        <div class="np-library-progress" aria-live="polite">
          <div class="np-library-progress-top"><span data-upload-phase>เตรียมอัปโหลด</span><b data-upload-percent>0%</b></div>
          <div class="np-library-progress-bar"><i data-upload-bar></i></div>
        </div>
      </div>
    `;
    host.prepend(card);
    card.querySelector('video')?.play?.().catch(() => {});
    if (uploadToken && !options.restored) {
      pendingUploadStore().set(uploadToken, {
        uploadToken,
        name,
        fileName: video?.name || name,
        size: video?.size,
        mediaUrl: video?.mediaUrl || '',
        phase: 'queued',
        percent: 0,
        text: 'กำลังเตรียมไฟล์ขึ้น server...',
        updatedAt: Date.now()
      });
      persistPendingUploadStore();
    }
    updatePendingLibraryCard(card, pendingUploadStore().get(uploadToken) || {});
    card.querySelector('[data-cancel-upload]')?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      try {
        const jobId = (pendingUploadStore().get(uploadToken) || {}).serverUploadId || uploadToken;
        if (jobId) await cancelLibraryUploadJob(jobId);
        if (uploadToken) pendingUploadStore().delete(uploadToken);
        persistPendingUploadStore();
        card.remove();
        hideLibraryEmptyState();
        notify('ยกเลิกอัปโหลดแล้ว', 'info');
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), 'danger');
      }
    });
    const onProgress = (event) => {
      const detail = event.detail || {};
      if (uploadToken && detail.uploadToken !== uploadToken) return;
      if (detail.phase === 'complete') {
        pendingUploadStore().delete(uploadToken);
        persistPendingUploadStore();
        card.remove();
        hideLibraryEmptyState();
        return;
      }
      if (uploadToken) {
        pendingUploadStore().set(uploadToken, {...(pendingUploadStore().get(uploadToken) || {}), ...detail, updatedAt: Date.now()});
        persistPendingUploadStore();
      }
      updatePendingLibraryCard(card, detail);
    };
    window.addEventListener('np-upload-progress', onProgress);
    return () => {
      window.removeEventListener('np-upload-progress', onProgress);
      card.remove();
    };
  }

  function syncPendingLibraryCards() {
    const host = libraryGrid();
    if (!host) return;
    for (const item of pendingUploadStore().values()) {
      if (!item?.uploadToken) continue;
      if (item.phase === 'complete') {
        pendingUploadStore().delete(item.uploadToken);
        persistPendingUploadStore();
        continue;
      }
      if (host.querySelector(`.np-library-pending-card[data-upload-token="${CSS.escape(item.uploadToken)}"]`)) continue;
      insertPendingLibraryCard({
        uploadToken: item.uploadToken,
        name: item.fileName || item.name,
        size: item.size,
        mediaUrl: item.mediaUrl || ''
      }, item.name || item.fileName || 'วิดีโอใหม่', {restored: true});
    }
    hideLibraryEmptyState();
  }

  let libraryJobsHydratePending = false;
  let libraryJobsHydrateLastRun = 0;
  async function hydratePendingLibraryJobs(force = false) {
    if (!isLibrarySectionActive() || libraryJobsHydratePending) return;
    const now = Date.now();
    if (!force && now - libraryJobsHydrateLastRun < 2500) return;
    libraryJobsHydratePending = true;
    libraryJobsHydrateLastRun = now;
    try {
      const jobs = await listLibraryUploadJobs();
      const activeJobIds = new Set(jobs.map((job) => String(job?.uploadId || job?.serverUploadId || job?.uploadToken || '')).filter(Boolean));
      const activeJobKeys = new Set(jobs.map((job) => `${String(job?.fileName || job?.name || '').toLowerCase()}:${Number(job?.size || 0)}`));
      let changed = false;
      for (const [token, item] of pendingUploadStore()) {
        if (!item?.uploadToken || item.phase === 'complete') {
          pendingUploadStore().delete(token);
          changed = true;
          continue;
        }
        const serverId = String(item.serverUploadId || item.uploadId || '');
        const itemKey = `${String(item.fileName || item.name || '').toLowerCase()}:${Number(item.size || 0)}`;
        const hasActiveJob = (serverId && activeJobIds.has(serverId)) || activeJobKeys.has(itemKey);
        const staleLocal = !serverId && Number(item.updatedAt || 0) > 0 && now - Number(item.updatedAt) > 60 * 1000;
        if ((serverId && !hasActiveJob) || staleLocal) {
          pendingUploadStore().delete(token);
          changed = true;
        }
      }
      for (const job of jobs) {
        const jobId = job.uploadId || job.serverUploadId || job.uploadToken;
        const existing = [...pendingUploadStore().values()].find((item) => {
          if (item?.serverUploadId && String(item.serverUploadId) === String(jobId)) return true;
          return String(item?.fileName || item?.name || '').toLowerCase() === String(job?.fileName || job?.name || '').toLowerCase()
            && Number(item?.size || 0) === Number(job?.size || 0);
        });
        const uploadToken = existing?.uploadToken || job.uploadToken || jobId;
        if (!uploadToken) continue;
        const current = pendingUploadStore().get(uploadToken) || {};
        pendingUploadStore().set(uploadToken, {...job, ...current, uploadToken, serverUploadId: jobId, fileName: current.fileName || job.fileName || job.name, name: current.name || job.name, updatedAt: Date.now()});
        changed = true;
      }
      if (changed) persistPendingUploadStore();
      syncPendingLibraryCards();
    } catch (error) {
      console.warn('[np-live-patch] upload jobs hydrate failed', error);
    } finally {
      libraryJobsHydratePending = false;
    }
  }

  function hideLibraryEmptyState() {
    const page = getLibraryPage();
    if (!page) return;
    const grid = ensureLibraryGrid();
    const cards = Array.from(page.querySelectorAll('.library-card,.np-library-pending-card'));
    cards.forEach((card) => {
      if (grid && card.parentElement !== grid) grid.append(card);
    });
    const hasCards = Boolean(grid?.querySelector('.library-card,.np-library-pending-card'));
    page.querySelectorAll('.placeholder-page,.placeholder-page.inline').forEach((placeholder) => {
      const text = placeholder.textContent || '';
      if (text.includes('ยังไม่มีวิดีโอในคลัง')) {
        placeholder.style.display = hasCards ? 'none' : '';
        placeholder.hidden = hasCards;
      }
    });
  }

  function openLibraryUploadModal() {
    return new Promise((resolve) => {
      let selected = null;
      const wrap = document.createElement('div');
      wrap.className = 'np-library-upload-backdrop';
      wrap.innerHTML = `
        <div class="np-library-upload-modal" role="dialog" aria-modal="true">
          <div class="np-library-upload-head">
            <div>
              <span>UPLOAD VIDEO</span>
              <h2>เพิ่มวิดีโอใหม่เข้าคลัง</h2>
              <p>เลือกไฟล์จากเครื่อง ดูพรีวิว ตั้งชื่อก่อน แล้วค่อยกดบันทึกเข้าคลัง</p>
            </div>
            <button class="np-library-upload-close" type="button" aria-label="ปิด">×</button>
          </div>
          <div class="np-library-upload-body">
            <button class="np-library-upload-drop" type="button" data-pick>
              <span class="np-library-upload-empty"><b>+</b><strong>Preview 9:16</strong><small>MP4 / MOV / MKV / WebM / M4V</small></span>
            </button>
            <div class="np-library-upload-form">
              <label>ชื่อวิดีโอ *
                <input data-name placeholder="เช่น วิดีโอสินค้า 1" disabled>
              </label>
              <div class="np-library-upload-meta">
                <span>ชื่อไฟล์</span>
                <strong data-file>ยังไม่ได้เลือกไฟล์</strong>
                <span>ขนาด</span>
                <strong data-size>N/A</strong>
              </div>
              <div class="np-library-upload-actions">
                <button class="np-library-upload-primary" type="button" data-save disabled>เพิ่มเข้าคลัง</button>
                <button class="np-library-upload-secondary" type="button" data-cancel>ยกเลิก</button>
              </div>
              <div class="np-library-upload-note">กดแล้วระบบจะแสดงสถานะในคลังวิดีโอ สามารถไปทำงานอื่นต่อได้ทันที</div>
            </div>
          </div>
        </div>
      `;
      const close = (result) => {
        wrap.remove();
        resolve(result);
      };
      const resetSelected = () => {
        selected = null;
        wrap.querySelector('[data-name]').disabled = true;
        wrap.querySelector('[data-name]').value = '';
        wrap.querySelector('[data-file]').textContent = 'ยังไม่ได้เลือกไฟล์';
        wrap.querySelector('[data-size]').textContent = 'N/A';
        wrap.querySelector('[data-save]').disabled = true;
        wrap.querySelector('[data-pick]').innerHTML = '<span class="np-library-upload-empty"><b>+</b><strong>Preview 9:16</strong><small>MP4 / MOV / MKV / WebM / M4V</small></span>';
      };
      const pick = async () => {
        try {
          const video = await window.rerun.chooseLibraryVideo();
          if (!video) return;
          selected = video;
          const safeName = stripVideoExtension(video.name) || video.name || 'วิดีโอใหม่';
          wrap.querySelector('[data-name]').disabled = false;
          wrap.querySelector('[data-name]').value = safeName;
          wrap.querySelector('[data-file]').textContent = video.name || video.path || 'วิดีโอ';
          wrap.querySelector('[data-size]').textContent = formatBytes(video.size);
          wrap.querySelector('[data-save]').disabled = false;
          wrap.querySelector('[data-pick]').innerHTML = video.mediaUrl
            ? `<button class="np-library-clear-video" type="button" data-clear-video aria-label="ล้างวิดีโอที่เลือก">×</button><video src="${escapeHtml(video.mediaUrl)}" controls playsinline preload="metadata"></video>`
            : '<span class="np-library-upload-empty"><b>+</b><strong>Preview 9:16</strong><small>เลือกไฟล์ใหม่</small></span>';
          const preview = wrap.querySelector('[data-pick] video');
          if (preview) {
            preview.controls = true;
            preview.muted = false;
            preview.currentTime = 0;
          }
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), 'danger');
        }
      };
      wrap.querySelector('.np-library-upload-close').addEventListener('click', () => close(null));
      wrap.querySelector('[data-cancel]').addEventListener('click', () => close(null));
      wrap.querySelector('[data-pick]').addEventListener('click', (event) => {
        if (event.target?.closest?.('[data-clear-video]')) {
          event.preventDefault();
          event.stopPropagation();
          resetSelected();
          return;
        }
        if (selected && event.target?.closest?.('video')) return;
        pick();
      });
      wrap.querySelector('[data-save]').addEventListener('click', () => {
        if (!selected) return;
        const name = wrap.querySelector('[data-name]').value.trim() || stripVideoExtension(selected.name) || selected.name || 'วิดีโอใหม่';
        close({ video: selected, name });
      });
      document.body.append(wrap);
    });
  }

  function confirmLibraryDelete(item) {
    return new Promise((resolve) => {
      document.querySelector('.np-library-confirm-backdrop')?.remove();
      const wrap = document.createElement('div');
      wrap.className = 'np-library-confirm-backdrop';
      wrap.innerHTML = `
        <div class="np-library-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="np-library-confirm-title">
          <div>
            <h3 id="np-library-confirm-title">จะลบวิดีโอนี้ใช่มั้ย?</h3>
            <p>เมื่อลบแล้ววิดีโอนี้จะออกจากคลังวิดีโอของบัญชีนี้</p>
          </div>
          <div class="np-library-confirm-name" title="${escapeHtml(item?.path || item?.name || '')}">${escapeHtml(item?.name || 'วิดีโอ')}</div>
          <div class="np-library-confirm-actions">
            <button class="np-library-confirm-cancel" type="button" data-cancel>ยกเลิก</button>
            <button class="np-library-confirm-delete" type="button" data-confirm>ยืนยัน</button>
          </div>
        </div>
      `;
      const close = (value) => {
        wrap.remove();
        resolve(value);
      };
      wrap.addEventListener('click', (event) => {
        if (event.target === wrap) close(false);
      });
      wrap.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') close(false);
        if (event.key === 'Enter') close(true);
      });
      wrap.querySelector('[data-cancel]').addEventListener('click', () => close(false));
      wrap.querySelector('[data-confirm]').addEventListener('click', () => close(true));
      document.body.append(wrap);
      wrap.querySelector('[data-cancel]')?.focus?.();
    });
  }

  function renderLibraryDom(items) {
    const page = getLibraryPage();
    if (!page || !Array.isArray(items)) return;
    page.querySelector('.placeholder-page.inline')?.remove();
    const seenItems = new Set();
    const uniqueItems = items.filter((item) => {
      const key = String(item?.path || item?.id || `${item?.name || ''}:${item?.size || ''}`).trim();
      if (!key || seenItems.has(key)) return false;
      seenItems.add(key);
      return true;
    });
    const signature = uniqueItems.map((item) => [item?.id || '', item?.path || '', item?.name || '', Number(item?.size || 0)].join('|')).join('::');
    const acceptedKeys = new Set(uniqueItems.map((item) => `${stripVideoExtension(item?.name || item?.path || '').toLowerCase()}:${Number(item?.size || 0)}`));
    let removedPending = false;
    for (const item of pendingUploadStore().values()) {
      const key = `${stripVideoExtension(item?.name || item?.fileName || '').toLowerCase()}:${Number(item?.size || 0)}`;
      if (acceptedKeys.has(key)) {
        if (item?.uploadToken) pendingUploadStore().delete(item.uploadToken);
        removedPending = true;
      }
    }
    if (removedPending) persistPendingUploadStore();
    const grid = ensureLibraryGrid();
    if (!grid) return;
    grid.querySelectorAll('.np-library-pending-card').forEach((card) => {
      const name = stripVideoExtension(card.querySelector('strong')?.textContent || '').toLowerCase();
      const sizeText = card.textContent || '';
      const mb = Number((sizeText.match(/([\d,.]+)\s*MB/i)?.[1] || '0').replace(/,/g, ''));
      const approxBytes = Math.round(mb * 1024 * 1024);
      const hasAccepted = uniqueItems.some((item) => stripVideoExtension(item?.name || '').toLowerCase() === name && Math.abs(Number(item?.size || 0) - approxBytes) < 1024 * 1024);
      if (hasAccepted) card.remove();
    });
    if (grid.dataset.librarySignature === signature && grid.querySelectorAll('.library-card').length === uniqueItems.length) {
      attachLibraryCardControls(grid);
      hideLibraryEmptyState();
      return;
    }
    page.querySelectorAll('.library-card,.video-card').forEach((card) => card.remove());
    grid.innerHTML = uniqueItems.map((item) => `
      <div class="library-card card" data-library-id="${escapeHtml(item.id)}">
        <div class="library-thumb"><video src="${escapeHtml(item.mediaUrl || '')}" muted playsinline preload="metadata"></video></div>
        <div class="library-info">
          <strong title="${escapeHtml(item.path || item.name || '')}">${escapeHtml(item.name || 'วิดีโอ')}</strong>
          <div class="np-library-kebab">⋮</div>
          <div class="np-library-meta-grid">
            <div class="np-library-meta-box"><span>ขนาดไฟล์</span><b>${escapeHtml(formatBytes(item.size))}</b></div>
            <div class="np-library-meta-box"><span>วันที่อัปโหลด</span><b>${escapeHtml(formatThaiDate(item.addedAt))}</b></div>
          </div>
          <button class="np-library-play-button" type="button">▷ เล่นวิดีโอ</button>
        </div>
        <button class="icon-button danger" type="button" title="ลบออกจากคลัง" data-remove-library="${escapeHtml(item.id)}">×</button>
      </div>
    `).join('');
    grid.dataset.librarySignature = signature;
    attachLibraryCardControls(grid);
    syncPendingLibraryCards();
    hideLibraryEmptyState();
    syncLibraryUploadButton();
    grid.querySelectorAll('[data-remove-library]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = button.dataset.removeLibrary;
        const item = uniqueItems.find((entry) => String(entry?.id) === String(id));
        const confirmed = await confirmLibraryDelete(item);
        if (!confirmed) return;
        try {
          button.disabled = true;
          renderLibraryDom(await window.rerun.removeLibrary(id));
        } catch (error) {
          button.disabled = false;
          notify(error instanceof Error ? error.message : String(error), 'danger');
        }
      });
    });
  }

  function attachLibraryCardControls(root = document) {
    root.querySelectorAll('.library-card').forEach((card) => {
      if (card.dataset.npControlsAttached === '1') return;
      card.dataset.npControlsAttached = '1';
      const video = card.querySelector('video');
      const playButton = card.querySelector('.np-library-play-button');
      const thumb = card.querySelector('.library-thumb');
      const play = (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (!video) return;
        video.controls = true;
        video.muted = false;
        if (video.paused) {
          video.play?.().then(() => card.classList.add('np-library-playing')).catch(() => {});
          if (playButton) playButton.textContent = '⏸ หยุดเล่น';
        } else {
          video.pause?.();
          card.classList.remove('np-library-playing');
          if (playButton) playButton.textContent = '▷ เล่นวิดีโอ';
        }
      };
      playButton?.addEventListener('click', play);
      thumb?.addEventListener('click', play);
      video?.addEventListener('pause', () => {
        card.classList.remove('np-library-playing');
        if (playButton) playButton.textContent = '▷ เล่นวิดีโอ';
      });
      video?.addEventListener('play', () => {
        card.classList.add('np-library-playing');
        if (playButton) playButton.textContent = '⏸ หยุดเล่น';
      });
      video?.addEventListener('ended', () => {
        card.classList.remove('np-library-playing');
        if (playButton) playButton.textContent = '▷ เล่นวิดีโอ';
      });
    });
  }

  function toggleLibraryCardVideo(card) {
    const video = card?.querySelector?.('video');
    if (!video) return;
    const playButton = card.querySelector('.np-library-play-button');
    video.controls = true;
    video.muted = false;
    video.setAttribute('playsinline', '');
    if (video.paused) {
      video.play?.().then(() => {
        card.classList.add('np-library-playing');
        if (playButton) playButton.textContent = '⏸ หยุดเล่น';
      }).catch((error) => {
        notify(error instanceof Error ? error.message : 'เล่นวิดีโอไม่ได้', 'danger');
      });
    } else {
      video.pause?.();
      card.classList.remove('np-library-playing');
      if (playButton) playButton.textContent = '▷ เล่นวิดีโอ';
    }
  }

  function hookLibraryPlayDelegation() {
    if (document.documentElement.dataset.npLibraryPlayDelegated === '1') return;
    document.documentElement.dataset.npLibraryPlayDelegated = '1';
    document.addEventListener('click', (event) => {
      const target = event.target;
      const playTarget = target?.closest?.('.library-page .library-thumb, .library-page .np-library-play-button');
      if (!playTarget) return;
      const card = playTarget.closest('.library-card');
      if (!card) return;
      event.preventDefault();
      event.stopPropagation();
      toggleLibraryCardVideo(card);
    }, true);
  }

  async function polishLibraryCards() {
    const page = getLibraryPage();
    if (!page || page.dataset.npPolishing === '1') return;
    const cards = Array.from(page.querySelectorAll('.library-card'));
    if (!cards.length) return;
    page.dataset.npPolishing = '1';
    try {
      const list = await window.rerun?.listLibrary?.().catch(() => []);
      const items = Array.isArray(list) ? list : [];
      cards.forEach((card, index) => {
        if (card.dataset.npPolished === '1') return;
        const item = items[index] || {};
        card.dataset.npPolished = '1';
        const thumb = card.querySelector('.library-thumb');
        if (thumb && !thumb.querySelector('.np-library-play-triangle')) {
          const triangle = document.createElement('span');
          triangle.className = 'np-library-play-triangle';
          thumb.append(triangle);
        }
        const info = card.querySelector('.library-info');
        if (info && !info.querySelector('.np-library-meta-grid')) {
          const oldSmall = info.querySelector('small');
          const dateText = formatThaiDate(item.addedAt || Date.now());
          oldSmall?.remove();
          const kebab = document.createElement('div');
          kebab.className = 'np-library-kebab';
          kebab.textContent = '⋮';
          const meta = document.createElement('div');
          meta.className = 'np-library-meta-grid';
          meta.innerHTML = `
            <div class="np-library-meta-box"><span>ขนาดไฟล์</span><b>${escapeHtml(formatBytes(item.size))}</b></div>
            <div class="np-library-meta-box"><span>วันที่อัปโหลด</span><b>${escapeHtml(dateText)}</b></div>
          `;
          const play = document.createElement('button');
          play.className = 'np-library-play-button';
          play.type = 'button';
          play.textContent = '▷ เล่นวิดีโอ';
          info.append(kebab, meta, play);
        }
        attachLibraryCardControls(card);
      });
    } finally {
      page.dataset.npPolishing = '0';
    }
  }

  async function runLibraryUpload(renderResult = false) {
    if (!(await canStartLibraryUpload())) return null;
    const draft = await openLibraryUploadModal();
    if (!draft) return null;
    if (!(await canStartLibraryUpload())) return null;
    const removePending = insertPendingLibraryCard(draft.video, draft.name);
    try {
      const result = await window.rerun.saveLibraryVideo({ ...draft.video, name: draft.name });
      removePending();
      if (renderResult) renderLibraryDom(result);
      syncLibraryUploadButton();
      return result;
    } catch (error) {
      removePending();
      syncLibraryUploadButton();
      notify(error instanceof Error ? error.message : String(error), 'danger');
      return null;
    }
  }

  function hookLibraryUploadFlow() {
    if (!window.rerun || window.rerun.__npLibraryUploadPatched) return;
    if (typeof window.rerun.chooseLibraryVideo !== 'function' || typeof window.rerun.saveLibraryVideo !== 'function') return;
    const originalListLibrary = window.rerun.listLibrary?.bind(window.rerun);
    window.rerun.addLibrary = async () => {
      const result = await runLibraryUpload(false);
      return result || (originalListLibrary ? originalListLibrary() : []);
    };
    document.addEventListener('click', (event) => {
      const button = event.target?.closest?.('.library-page .library-hero .primary-button');
      if (!button || !(button.textContent || '').includes('เพิ่มวิดีโอ')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      runLibraryUpload(true);
    }, true);
    window.rerun.__npLibraryUploadPatched = true;
  }

  function makeOldLibraryDropClickable() {
    const oldModal = document.querySelector('.library-upload-backdrop:not(.np-library-upload-backdrop)');
    const preview = oldModal?.querySelector('.library-upload-preview');
    if (!preview || preview.dataset.npClickable === '1') return;
    preview.dataset.npClickable = '1';
    preview.style.cursor = 'pointer';
    preview.addEventListener('click', () => oldModal.querySelector('.library-pick-button')?.click());
  }

  function injectCustomerTester() {
    if (!isChatSettingsStep()) {
      document.querySelector('.np-live-ai-tester')?.remove();
      return;
    }
    const chatCard = document.querySelector('.chat-settings-card');
    if (!chatCard || document.querySelector('.np-live-ai-tester')) return;
    const panel = document.createElement('section');
    panel.className = 'card np-live-extra-card np-live-ai-tester';
    panel.innerHTML = `
      <div class="card-heading compact">
        <div>
          <span class="eyebrow">ลองถามลูกค้าไลฟ์สด</span>
          <h2>ทดสอบคำตอบก่อนปล่อยจริง</h2>
          <p>พิมพ์คำถามเหมือนลูกค้าหน้าไลฟ์สด ระบบจะให้ AI ตอบจาก prompt และข้อมูลสินค้าปัจจุบันของบัญชีนี้</p>
        </div>
      </div>
      <div class="np-live-row">
        <input class="text-input" data-question placeholder="เช่น 03 เหมาะกับผิวสีไหนคะ" value="ผิวแพ้ง่ายใช้ได้ไหมคะ">
        <button class="ghost-button" type="button" data-test>ทดสอบ</button>
      </div>
      <div class="clip-info np-live-result np-live-hidden" data-result></div>
    `;
    chatCard.parentElement?.insertBefore(panel, chatCard);
    panel.querySelector('[data-test]').addEventListener('click', async () => {
      const accountId = currentAccountId();
      const question = panel.querySelector('[data-question]').value;
      const resultBox = panel.querySelector('[data-result]');
      const button = panel.querySelector('[data-test]');
      button.disabled = true;
      button.textContent = 'กำลังทดสอบ...';
      resultBox.classList.remove('np-live-hidden', 'clip-warning');
      resultBox.classList.add('clip-info');
      resultBox.textContent = 'กำลังให้ AI ลองตอบ...';
      try {
        const result = await window.rerun.testChatAiQuestion(accountId, question);
        if (result.ok) {
          resultBox.classList.remove('clip-warning');
          resultBox.classList.add('clip-info');
          resultBox.textContent = `ตัวอย่างคำตอบ: ${result.reply}${result.chatEnabled === false ? ' (หมายเหตุ: สวิตช์ตอบแชทยังปิดอยู่)' : ''}`;
        } else {
          resultBox.classList.remove('clip-info');
          resultBox.classList.add('clip-warning');
          resultBox.textContent = result.error || 'AI ยังไม่ตอบกลับ';
        }
      } catch (error) {
        resultBox.classList.remove('clip-info');
        resultBox.classList.add('clip-warning');
        resultBox.textContent = error instanceof Error ? error.message : String(error);
      } finally {
        button.disabled = false;
        button.textContent = 'ทดสอบ';
      }
    });
  }

  function cookieValue(name) {
    return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='))?.slice(name.length + 1) || '';
  }

  async function topupFetch(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      cache: 'no-store',
      headers: {
        'X-NP-Web': '1',
        'X-NP-CSRF': cookieValue('np_csrf'),
        ...(options.body && !(options.body instanceof Blob) ? {'Content-Type': 'application/json'} : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || 'ทำรายการไม่สำเร็จ');
    return data;
  }

  async function registerCustomer(payload) {
    return topupFetch('/api/register', {method: 'POST', body: JSON.stringify(payload)});
  }

  function showRegisterDialog() {
    if (document.querySelector('.np-register-backdrop')) return;
    sessionStorage.setItem('np-register-open', '1');
    const wrap = document.createElement('div');
    wrap.className = 'np-register-backdrop';
    wrap.innerHTML = `
      <section class="np-register-modal" role="dialog" aria-modal="true">
        <div class="np-register-shell">
          <aside class="np-register-brand" aria-hidden="true">
            <div class="np-register-brand-top">
              <img class="np-register-brand-logo" src="./assets/logo-DpwLmXN6.png" alt="">
              <div class="np-register-brand-name"><strong><em>Digital</em><br>NP Studio</strong><small>LIVE STREAMING TOOLS</small></div>
            </div>
            <h3>เริ่มต้นใช้งานได้ในไม่กี่นาที</h3>
            <p>สมัครบัญชีไว้ก่อน แล้วเลือกแพ็กเกจและแนบสลิปในระบบได้เอง แอดมินตรวจสอบและปลดล็อกสิทธิ์ให้ภายหลัง</p>
            <div class="np-register-benefits">
              <div class="np-register-benefit"><i>1</i><span>สร้าง User สำหรับเข้า Studio</span></div>
              <div class="np-register-benefit"><i>2</i><span>เก็บอีเมล เบอร์โทร และ LINE ID</span></div>
              <div class="np-register-benefit"><i>3</i><span>เลือกแพ็กเกจหลังสมัครได้ทันที</span></div>
            </div>
          </aside>
          <div class="np-register-main">
            <div class="np-register-head">
              <div><h2>สมัครสมาชิก</h2><p>กรอกข้อมูลให้ครบ ระบบจะเปิดบัญชีให้ก่อน แล้วไปสมัครแพ็กเกจในเมนูแพ็กเกจ</p></div>
              <button class="np-register-close" type="button" aria-label="ปิด">×</button>
            </div>
            <form class="np-register-form">
              <label>User<input name="username" minlength="3" maxlength="60" required autocomplete="username" placeholder="เช่น coach_noom"></label>
              <label>Password<input name="password" type="password" minlength="8" maxlength="256" required autocomplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร"></label>
              <label class="full">ชื่อ-สกุล<input name="fullName" maxlength="120" required placeholder="ชื่อและนามสกุล"></label>
              <label>อีเมล<input name="email" type="email" maxlength="160" required placeholder="name@example.com"></label>
              <label>เบอร์โทร<input name="phone" maxlength="40" required inputmode="tel" placeholder="เบอร์ที่ติดต่อได้"></label>
              <label>LINE ID<input name="lineId" maxlength="80" placeholder="ใส่ไว้ให้แอดมินติดต่อกลับ"></label>
              <p class="np-register-note">หลังสมัครแล้วให้เข้าสู่ระบบด้วย User/Password จากนั้นเลือกแพ็กเกจและแนบสลิปเพื่อรอแอดมินอนุมัติ</p>
              <button class="np-register-submit" type="submit">✓ สมัครสมาชิก</button>
              <div class="np-register-error" role="alert"></div>
            </form>
          </div>
        </div>
      </section>
    `;
    const modal = wrap.querySelector('.np-register-modal');
    ['pointerdown','mousedown','mouseup','click','dblclick','keydown','keyup','input','change','focusin','submit'].forEach((type) => {
      modal?.addEventListener(type, (event) => event.stopPropagation());
    });
    const close = () => {
      sessionStorage.removeItem('np-register-open');
      wrap.remove();
    };
    wrap.querySelector('.np-register-close').addEventListener('click', close);
    wrap.addEventListener('click', (event) => event.stopPropagation());
    wrap.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector('.np-register-error');
      const data = Object.fromEntries(new FormData(form).entries());
      button.disabled = true;
      error.textContent = '';
      try {
        await registerCustomer(data);
        notify('สมัครสมาชิกสำเร็จ เข้าสู่ระบบแล้วไปที่เมนูแพ็กเกจได้เลย', 'success');
        close();
      } catch (err) {
        error.textContent = err.message || 'สมัครสมาชิกไม่สำเร็จ';
      } finally {
        button.disabled = false;
      }
    });
    document.body.append(wrap);
  }

  function syncRegistrationGate() {
    const form = document.querySelector('.license-card');
    if (!form) return;
    form.classList.add('np-account-card');
    if (sessionStorage.getItem('np-register-open') === '1' && !document.querySelector('.np-register-backdrop')) {
      showRegisterDialog();
    }
    if (form.dataset.npRegisterReady === '1') return;
    form.dataset.npRegisterReady = '1';
    const subtitle = form.querySelector('.license-sub');
    if (subtitle) subtitle.textContent = 'เข้าสู่ระบบด้วย User และ Password หรือสมัครสมาชิกเพื่อเลือกแพ็กเกจเอง';
    const licenseInput = form.querySelector('#license-key');
    const licenseField = licenseInput?.closest?.('.license-field');
    const licenseLabel = form.querySelector('label[for="license-key"]');
    if (licenseInput) licenseInput.value = '';
    if (licenseField) licenseField.style.display = 'none';
    if (licenseLabel) licenseLabel.style.display = 'none';
    const submit = form.querySelector('.license-submit');
    if (submit) submit.textContent = 'เข้าสู่ระบบ';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'np-register-link';
    button.textContent = 'สมัครสมาชิก';
    button.addEventListener('click', showRegisterDialog);
    submit?.insertAdjacentElement('afterend', button);
  }

  const money = (value) => Number(value || 0).toLocaleString('th-TH', {maximumFractionDigits: 0}) + ' THB';
  const packagePrice = (value) => Number(value || 0) > 0 ? `${Number(value || 0).toLocaleString('th-TH', {maximumFractionDigits: 0})} บาท` : 'ฟรี';
  const topupStatusLabel = (status) => status === 'approved' ? 'ปลดล็อกแล้ว' : status === 'rejected' ? 'ไม่อนุมัติ' : 'รอตรวจสอบ';
  const topupDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH') : '-';
  };
  const mainArea = () => document.querySelector('.main-area') || document.querySelector('main') || document.querySelector('.app-shell > div:last-child');

  async function uploadTopupSlip(file) {
    if (!file) throw Error('กรุณาแนบสลิปชำระค่าแพ็กเกจ');
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) throw Error('สลิปต้องเป็น PNG, JPEG หรือ WebP');
    if (file.size > 8 * 1024 * 1024) throw Error('สลิปต้องมีขนาดไม่เกิน 8 MB');
    return (await topupFetch('/api/upload?name=' + encodeURIComponent(file.name || 'slip.jpg'), {
      method: 'POST',
      body: file,
      headers: {'Content-Type': file.type || 'application/octet-stream'},
    })).id;
  }

  function showTopupPage() {
    const host = mainArea();
    if (!host) return;
    rememberSidebarSection('แพ็กเกจ');
    document.body.classList.add('np-topup-active');
    host.querySelectorAll(':scope > [data-np-topup-page]').forEach((node) => node.remove());
    host.querySelectorAll(':scope > *').forEach((node) => {
      if (node.matches('[data-np-topup-page]')) return;
      if (node.matches('.topbar')) return;
      if (!node.dataset.npHiddenForTopup) {
        node.dataset.npHiddenForTopup = '1';
        node.dataset.npPreviousDisplay = node.style.display || '';
        node.style.setProperty('display','none','important');
      }
    });
    document.querySelectorAll('.accounts-bar').forEach((node) => {
      if (!node.dataset.npHiddenForTopup) {
        node.dataset.npHiddenForTopup = '1';
        node.dataset.npPreviousDisplay = node.style.display || '';
        node.style.setProperty('display','none','important');
      }
    });
    document.querySelectorAll('aside nav button').forEach((button) => {
      const isTopup = button.dataset.npTopupMenu === '1';
      button.classList.toggle('active', isTopup);
      button.classList.toggle('np-force-active', isTopup);
    });
    host.dataset.npTopupActive = '1';
    host.insertAdjacentHTML('beforeend', `
      <section class="np-topup-page" data-np-topup-page>
        <div class="np-topup-layout">
          <section class="np-topup-card">
            <div class="np-package-head">
              <div><span class="eyebrow">จัดการแพ็กเกจ</span><h1>แพ็กเกจ</h1><p>เลือกแพ็กเกจที่ต้องการใช้งาน ชำระยอดตามแพ็กเกจ แล้วแนบสลิปให้แอดมินตรวจสอบ</p></div>
              <div class="np-package-count"><span>แพ็กเกจที่ใช้งานอยู่</span><strong data-balance>0</strong></div>
            </div>
            <section class="np-current-package" data-current-package></section>
            <div class="np-section-divider"></div>
            <div class="np-history-launch">
              <div><h2>ประวัติการสมัครแพ็กเกจ</h2><p>กดเพื่อดูรายการรอตรวจสอบ ปลดล็อกแล้ว และไม่อนุมัติ</p></div>
              <button type="button" data-open-history>ดูประวัติ</button>
            </div>
            <dialog class="np-history-dialog" data-history-dialog>
              <div class="np-history-dialog-inner">
                <div class="np-history-dialog-head">
                  <div><h2>ประวัติการสมัครแพ็กเกจ</h2><p>ติดตามสถานะคำขอของบัญชีนี้</p></div>
                  <button class="np-history-close" type="button" data-close-history>×</button>
                </div>
                <div class="np-topup-tabs" data-tabs><button class="active" data-status="all">ทั้งหมด</button><button data-status="pending">รอตรวจสอบ</button><button data-status="approved">ปลดล็อกแล้ว</button><button data-status="rejected">ไม่อนุมัติ</button></div>
                <div class="np-topup-list" data-history></div>
              </div>
            </dialog>
            <div class="np-section-divider"></div>
            <div>
              <h2>เลือกแพ็กเกจ</h2><p>กดเลือกแพ็กเกจ ระบบจะแสดงช่องทางชำระเงินและให้แนบสลิป</p>
              <div class="np-topup-packages" data-packages><div class="np-topup-empty">กำลังโหลดแพ็กเกจ...</div></div>
            </div>
          </section>
        </div>
      </section>
    `);
    const page = host.querySelector('[data-np-topup-page]');
    renderTopupPage(page).catch((error) => {
      notify(error.message || String(error), 'danger');
      const packages = page?.querySelector('[data-packages]');
      if (packages) {
        packages.innerHTML = `
          <div class="np-topup-empty">
            โหลดข้อมูลแพ็กเกจไม่สำเร็จ<br>
            <button type="button" data-retry-topup style="margin-top:10px;min-height:36px;padding:8px 14px;border-radius:10px;border:1px solid rgba(245,158,11,.62);background:#f59e0b;color:#07101d;font-weight:950">ลองโหลดใหม่</button>
          </div>
        `;
        packages.querySelector('[data-retry-topup]')?.addEventListener('click', () => renderTopupPage(page).catch((err) => notify(err.message || String(err), 'danger')));
      }
    });
  }

  function clearTopupMenuState() {
    const host = mainArea();
    document.body.classList.remove('np-topup-active');
    document.querySelectorAll('[data-np-topup-page]').forEach((page) => page.remove());
    document.querySelectorAll('dialog[open]').forEach((dialog) => {
      if (dialog.classList.contains('np-history-dialog')) dialog.close();
    });
    if (host) {
      host.querySelectorAll('[data-np-hidden-for-topup="1"]').forEach((node) => {
        node.style.removeProperty('display');
        if (node.dataset.npPreviousDisplay) node.style.display = node.dataset.npPreviousDisplay;
        delete node.dataset.npHiddenForTopup;
        delete node.dataset.npPreviousDisplay;
      });
      if (host.dataset?.npTopupActive === '1') delete host.dataset.npTopupActive;
    }
    document.querySelectorAll('.accounts-bar[data-np-hidden-for-topup="1"]').forEach((node) => {
      node.style.removeProperty('display');
      if (node.dataset.npPreviousDisplay) node.style.display = node.dataset.npPreviousDisplay;
      delete node.dataset.npHiddenForTopup;
      delete node.dataset.npPreviousDisplay;
    });
    syncAccountsBarVisibility();
    document.querySelectorAll('aside nav [data-np-topup-menu]').forEach((button) => button.classList.remove('active'));
  }

  function isLiveAccountsPage() {
    if (isTopupPageActive()) return false;
    if (document.querySelector('.page-intro[data-np-live-account-titleless="1"]')) return true;
    const activeButton = Array.from(document.querySelectorAll('aside nav button.active')).find((button) => button.offsetParent !== null);
    if (activeButton) return (activeButton.textContent || '').includes('บัญชีไลฟ์');
    return Array.from(document.querySelectorAll('.page-intro h1')).some((title) => {
      const intro = title.closest('.page-intro');
      if (!intro || intro.offsetParent === null || intro.dataset.npHiddenForTopup === '1') return false;
      return (title.textContent || '').includes('บัญชีไลฟ์');
    });
  }

  function isTopupPageActive() {
    return mainArea()?.dataset?.npTopupActive === '1' || !!document.querySelector('[data-np-topup-page]') || !!document.querySelector('aside nav [data-np-topup-menu].active');
  }

  function sidebarSectionFromButton(button) {
    const text = String(button?.textContent || '');
    return SIDEBAR_SECTIONS.find((label) => text.includes(label)) || '';
  }

  function rememberSidebarSection(label) {
    if (!SIDEBAR_SECTIONS.includes(label)) return;
    try { sessionStorage.setItem(SIDEBAR_SECTION_KEY, label); } catch {}
  }

  function rememberedSidebarSection() {
    try {
      const label = sessionStorage.getItem(SIDEBAR_SECTION_KEY) || '';
      return SIDEBAR_SECTIONS.includes(label) ? label : '';
    } catch {
      return '';
    }
  }

  function markSidebarSections(nav) {
    Array.from(nav.querySelectorAll(':scope > button')).forEach((button) => {
      const label = sidebarSectionFromButton(button);
      if (label) button.dataset.npSection = label;
    });
  }

  function currentSidebarSection(nav) {
    if (isTopupPageActive()) return 'แพ็กเกจ';
    markSidebarSections(nav);
    const buttons = Array.from(nav.querySelectorAll(':scope > button')).filter((button) => button.dataset.npSection);
    const visibleActive = buttons.filter((button) => button.classList.contains('active') && button.offsetParent !== null);
    if (visibleActive.length === 1) {
      const label = visibleActive[0].dataset.npSection || '';
      rememberSidebarSection(label);
      return label;
    }
    const remembered = rememberedSidebarSection();
    if (remembered && buttons.some((button) => button.dataset.npSection === remembered)) return remembered;
    const firstActive = visibleActive[0]?.dataset?.npSection || '';
    if (firstActive) return firstActive;
    return '';
  }

  function syncSidebarActiveHighlight() {
    const nav = document.querySelector('aside nav');
    if (!nav) return;
    const label = currentSidebarSection(nav);
    const buttons = Array.from(nav.querySelectorAll(':scope > button'));
    buttons.forEach((button) => {
      const isTarget = Boolean(label && button.dataset.npSection === label);
      button.classList.toggle('np-force-active', isTarget);
      if (label) button.classList.toggle('active', isTarget);
      if (isTarget) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }

  function syncAccountsBarVisibility() {
    document.body.classList.toggle('np-topup-active', isTopupPageActive());
    const shouldShow = isLiveAccountsPage();
    document.querySelectorAll('.accounts-bar').forEach((node) => {
      if (shouldShow) {
        if (node.dataset.npHiddenOutsideLive === '1') {
          node.style.removeProperty('display');
          if (node.dataset.npOutsidePreviousDisplay) node.style.display = node.dataset.npOutsidePreviousDisplay;
          delete node.dataset.npHiddenOutsideLive;
          delete node.dataset.npOutsidePreviousDisplay;
        }
        return;
      }
      if (node.dataset.npHiddenForTopup === '1') {
        node.style.setProperty('display','none','important');
        return;
      }
      if (node.dataset.npHiddenOutsideLive !== '1') {
        node.dataset.npHiddenOutsideLive = '1';
        node.dataset.npOutsidePreviousDisplay = node.style.display || '';
      }
      node.style.setProperty('display','none','important');
    });
  }

  function bindStableSidebarSwitching(nav) {
    if (!nav || nav.dataset.npStableSwitchBound === '1') return;
    nav.dataset.npStableSwitchBound = '1';
    nav.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const section = sidebarSectionFromButton(button);
      if (section) rememberSidebarSection(section);
      if (button.dataset.npTopupMenu === '1') return;
      if (mainArea()?.dataset?.npTopupActive === '1') clearTopupMenuState();
      window.setTimeout(safeTick, 0);
      window.setTimeout(safeTick, 120);
    }, true);
  }

  let packageGateStatus = null;
  let packageGateLoading = false;
  function refreshPackageGateStatus() {
    if (packageGateLoading || !window.rerun?.getLicenseStatus) return;
    packageGateLoading = true;
    window.rerun.getLicenseStatus().then((status) => {
      packageGateStatus = status;
    }).catch(() => {}).finally(() => {
      packageGateLoading = false;
    });
  }

  function syncPackageLockedSidebar(nav, locked) {
    if (!nav) return;
    nav.querySelectorAll(':scope > button').forEach((button) => {
      const shouldLock = Boolean(locked) && button.dataset.npTopupMenu !== '1';
      button.classList.toggle('np-package-locked', shouldLock);
      button.setAttribute('aria-disabled', shouldLock ? 'true' : 'false');
      if (shouldLock) button.title = 'กรุณาสมัครแพ็กเกจก่อนใช้งานเมนูนี้';
      else if (button.title === 'กรุณาสมัครแพ็กเกจก่อนใช้งานเมนูนี้') button.removeAttribute('title');
    });
  }

  function syncPackageGate(nav) {
    if (!nav) return;
    refreshPackageGateStatus();
    const locked = Boolean(packageGateStatus?.licensed && packageGateStatus.packageActive !== true);
    syncPackageLockedSidebar(nav, locked);
    document.body.classList.toggle('np-package-locked-mode', locked);
    if (!locked) return;
    const packageButton = nav.querySelector('[data-np-topup-menu]');
    nav.querySelectorAll(':scope > button').forEach((button) => {
      if (button.dataset.npTopupMenu === '1') return;
      if (button.dataset.npPackageGateBound === '1') return;
      button.dataset.npPackageGateBound = '1';
      button.addEventListener('click', (event) => {
        if (packageGateStatus?.packageActive === true) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        notify('กรุณาสมัครแพ็กเกจเพื่อใช้งานระบบ', 'warning');
        showTopupPage();
      }, true);
    });
    if (mainArea()?.dataset?.npTopupActive !== '1') {
      packageButton?.classList.add('active');
      showTopupPage();
    }
  }

  async function renderTopupPage(page) {
    const state = await topupFetch('/api/topup/overview');
    page.__topupState = state;
    page.__topupFilter = page.__topupFilter || 'all';
    const activePackageIds = new Set((state.activePackages || []).map((item) => item.packageId || item.id).filter(Boolean));
    if (state.currentPackage?.id) activePackageIds.add(state.currentPackage.id);
    page.querySelector('[data-balance]').textContent = `${Math.max(activePackageIds.size, state.currentPackage ? 1 : 0)} แพ็กเกจ`;
    renderCurrentPackage(page, state.currentPackage);
    renderTopupPackages(page, state.packages || []);
    renderTopupHistory(page);
    page.querySelector('[data-open-history]')?.addEventListener('click', () => page.querySelector('[data-history-dialog]')?.showModal());
    page.querySelector('[data-close-history]')?.addEventListener('click', () => page.querySelector('[data-history-dialog]')?.close());
    page.querySelector('[data-history-dialog]')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
    page.querySelector('[data-tabs]').onclick = (event) => {
      const button = event.target.closest('button[data-status]');
      if (!button) return;
      page.__topupFilter = button.dataset.status;
      page.querySelectorAll('[data-tabs] button').forEach((item) => item.classList.toggle('active', item === button));
      renderTopupHistory(page);
    };
  }

  function packageFeatures(p) {
    const unlimited = (value, unit) => Number(value || 0) > 0 ? `${fmtAdsNumber(value)} ${unit}` : 'ไม่จำกัด';
    return [
      `วันใช้งาน ${Number(p.durationDays || 0) > 0 ? `${fmtAdsNumber(p.durationDays)} วัน` : 'ตลอดชีพ'}`,
      `เครื่อง ${unlimited(p.machineLimit, 'เครื่อง')}`,
      `ช่องไลฟ์ ${unlimited(p.channelLimit, 'ช่อง')}`,
      `บัญชี Shopee ${unlimited(p.shopeeLimit, 'บัญชี')}`,
      `วิดีโอ ${unlimited(p.videoLimit, 'รายการ')}`,
      `ขนาดต่อคลิป ${unlimited(p.clipSizeGb, 'GB')}`,
    ];
  }

  function openPaymentDialog(page, selected) {
    document.querySelector('.np-payment-modal-backdrop')?.remove();
    const account = page.__topupState?.paymentAccount || {};
    const wrap = document.createElement('div');
    wrap.className = 'np-payment-modal-backdrop';
    wrap.innerHTML = `
      <section class="np-payment-modal" role="dialog" aria-modal="true">
        <div class="np-payment-modal-head">
          <div><h2>ชำระแพ็กเกจ ${selected.name || ''}</h2><p>โอนยอดตามแพ็กเกจ แล้วแนบสลิปเพื่อส่งให้แอดมินตรวจสอบ</p></div>
          <button class="np-payment-close" type="button" aria-label="ปิด">×</button>
        </div>
        <form class="np-payment-modal-body">
          <div class="np-payment-info">
            <div class="np-payment-line"><span>ชื่อธนาคาร</span><strong>${account.bankName || 'ยังไม่ได้ตั้งค่าธนาคาร'}</strong></div>
            <div class="np-payment-line"><span>ชื่อบัญชี</span><strong>${account.accountName || 'ยังไม่ได้ตั้งชื่อบัญชี'}</strong></div>
            <div class="np-payment-line has-copy"><span>เลขบัญชี</span><strong>${account.accountNumber || 'ยังไม่ได้ตั้งเลขบัญชี'}</strong><button class="np-payment-copy" type="button" data-copy-account ${account.accountNumber ? '' : 'disabled'} aria-label="คัดลอกเลขบัญชี" title="คัดลอกเลขบัญชี"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button></div>
            <div class="np-payment-line amount"><span>ยอดที่ต้องโอน</span><strong>${money(selected.price)}</strong></div>
          </div>
          <label class="np-payment-slip">แนบสลิป<input data-slip type="file" accept="image/png,image/jpeg,image/webp" required></label>
          <button class="np-payment-submit" type="submit">ส่งคำขอสมัครแพ็กเกจ</button>
          <div class="np-payment-error" role="alert"></div>
        </form>
      </section>
    `;
    const close = () => wrap.remove();
    const modal = wrap.querySelector('.np-payment-modal');
    ['pointerdown','mousedown','mouseup','click','dblclick','keydown','keyup','input','change','focusin','submit'].forEach((type) => {
      modal?.addEventListener(type, (event) => event.stopPropagation());
    });
    wrap.querySelector('.np-payment-close')?.addEventListener('click', close);
    wrap.querySelector('[data-copy-account]')?.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(account.accountNumber || '');
      notify('คัดลอกเลขบัญชีแล้ว', 'success');
    });
    wrap.addEventListener('click', (event) => {
      if (event.target === wrap) close();
    });
    wrap.querySelector('form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector('.np-payment-error');
      button.disabled = true;
      button.textContent = 'กำลังส่ง...';
      error.textContent = '';
      try {
        const uploadId = await uploadTopupSlip(form.querySelector('[data-slip]')?.files?.[0]);
        await topupFetch('/api/topup/request', {method: 'POST', body: JSON.stringify({packageId: selected.id, uploadId})});
        notify('ส่งคำขอสมัครแพ็กเกจแล้ว รอแอดมินตรวจสอบ', 'success');
        close();
        await renderTopupPage(page);
      } catch (err) {
        error.textContent = err.message || 'ส่งคำขอไม่สำเร็จ';
      } finally {
        button.disabled = false;
        button.textContent = 'ส่งคำขอสมัครแพ็กเกจ';
      }
    });
    document.body.append(wrap);
  }

  function renderCurrentPackage(page, current) {
    const box = page.querySelector('[data-current-package]');
    if (!box) return;
    if (!current) {
      box.innerHTML = `
        <div class="np-current-package-top">
          <div class="np-current-icon">!</div>
          <div><span>สถานะแพ็กเกจ</span><h2>ยังไม่สมัครแพ็กเกจ</h2><p>เลือกแพ็กเกจด้านล่าง ชำระเงิน และแนบสลิปเพื่อให้แอดมินปลดล็อกการใช้งาน</p></div>
          <div class="np-current-days"><span>สถานะ</span><b>รอสมัคร</b></div>
        </div>
      `;
      return;
    }
    const p = current || {name:'Starter', machineLimit:1, channelLimit:5, videoLimit:10, shopeeLimit:0, clipSizeGb:0, durationDays:30, price:0};
    box.innerHTML = `
      <div class="np-current-package-top">
        <div class="np-current-icon">♕</div>
        <div><span>แพ็กเกจปัจจุบัน</span><h2>${p.name || 'Starter'}</h2><p>${p.notes || 'แพ็กเกจที่กำลังใช้งานอยู่'}</p></div>
        <div class="np-current-days"><span>สถานะ</span><b>ใช้งาน</b></div>
      </div>
      <div class="np-current-limits">
        <div class="np-current-limit"><small><span>วันใช้งาน</span><b>${Number(p.durationDays || 0) > 0 ? fmtAdsNumber(p.durationDays) + ' วัน' : 'ตลอดชีพ'}</b></small><div class="np-limit-bar"><i style="width:100%"></i></div></div>
        <div class="np-current-limit"><small><span>เครื่อง</span><b>${Number(p.machineLimit || 0) > 0 ? fmtAdsNumber(p.machineLimit) : 'ไม่จำกัด'}</b></small><div class="np-limit-bar"><i style="width:100%"></i></div></div>
        <div class="np-current-limit"><small><span>ช่องไลฟ์</span><b>${Number(p.channelLimit || 0) > 0 ? fmtAdsNumber(p.channelLimit) : 'ไม่จำกัด'}</b></small><div class="np-limit-bar"><i style="width:100%"></i></div></div>
        <div class="np-current-limit"><small><span>Shopee</span><b>${Number(p.shopeeLimit || 0) > 0 ? fmtAdsNumber(p.shopeeLimit) : 'ไม่จำกัด'}</b></small><div class="np-limit-bar"><i style="width:100%"></i></div></div>
        <div class="np-current-limit"><small><span>วิดีโอ</span><b>${Number(p.videoLimit || 0) > 0 ? fmtAdsNumber(p.videoLimit) : 'ไม่จำกัด'}</b></small><div class="np-limit-bar"><i style="width:100%"></i></div></div>
        <div class="np-current-limit"><small><span>GB/คลิป</span><b>${Number(p.clipSizeGb || 0) > 0 ? fmtAdsNumber(p.clipSizeGb) : 'ไม่จำกัด'}</b></small><div class="np-limit-bar"><i style="width:100%"></i></div></div>
      </div>
    `;
  }

  function renderTopupPackages(page, packages) {
    const wrap = page.querySelector('[data-packages]');
    if (!packages.length) {
      wrap.innerHTML = '<div class="np-topup-empty">ยังไม่มีแพ็กเกจที่เปิดให้สมัคร</div>';
      return;
    }
    const currentId = page.__topupState?.currentPackage?.id;
    wrap.innerHTML = packages.map((p) => {
      const isCurrent = p.id === currentId;
      const disabled = isCurrent || Number(p.price || 0) <= 0;
      const label = isCurrent ? 'กำลังใช้งานอยู่' : Number(p.price || 0) <= 0 ? 'ยังไม่ตั้งราคา' : 'เลือกแพ็กเกจ';
      return `<article class="np-topup-package ${page.__selectedPackage?.id === p.id ? 'is-selected' : ''} ${isCurrent ? 'is-current' : ''}" data-package-id="${p.id}">
        ${isCurrent ? '<span class="np-package-badge">ใช้งานอยู่</span>' : ''}
        <div><span class="np-package-kicker">แพ็กเกจ</span><h3>${p.name}</h3></div>
        <div class="np-topup-price">${packagePrice(p.price)}<small style="display:block;margin-top:4px;color:#aebdd3;font-size:12px">ต่อรอบการใช้งาน</small></div>
        <div class="np-topup-meta">${packageFeatures(p).map((text) => `<span>${text}</span>`).join('')}</div>
        <button type="button" class="${isCurrent ? 'is-current' : ''}" ${disabled ? 'disabled' : ''}>${label}</button>
      </article>`;
    }).join('');
    wrap.onclick = (event) => {
      const card = event.target.closest('[data-package-id]');
      if (!card) return;
      const selected = packages.find((item) => item.id === card.dataset.packageId);
      if (!selected || selected.id === page.__topupState?.currentPackage?.id || Number(selected.price || 0) <= 0) return;
      openPaymentDialog(page, selected);
    };
  }

  function renderTopupHistory(page) {
    const list = page.querySelector('[data-history]');
    const filter = page.__topupFilter || 'all';
    const rows = (page.__topupState?.requests || []).filter((item) => filter === 'all' || item.status === filter);
    if (!rows.length) {
      list.innerHTML = '<div class="np-topup-empty">ยังไม่มีรายการในสถานะนี้</div>';
      return;
    }
    list.innerHTML = rows.map((item) => `<article class="np-topup-item"><div><strong>${item.packageName} · ${money(item.amount)}</strong><small>ส่งเมื่อ ${topupDate(item.createdAt)}${item.reviewedBy ? ` · ${item.reviewedBy} ปลดล็อก` : ''}${item.note ? ` · ${item.note}` : ''}</small></div><span class="np-status ${item.status}">${topupStatusLabel(item.status)}</span></article>`).join('');
  }

  function orderMainSidebar(nav) {
    if (!nav) return;
    if (!ADS_MANAGER_ENABLED) {
      Array.from(nav.querySelectorAll(':scope > button')).forEach((button) => {
        const text = button.textContent || '';
        if (text.includes('บอทยิงแอด') || text.includes('ยิงแอด')) button.remove();
      });
      nav.querySelector('.np-ads-sidebar')?.remove();
    }
    const wanted = ['แดชบอร์ด', 'บัญชีไลฟ์', 'แพ็กเกจ', 'คลังวิดีโอ', 'สรุปไลฟ์ย้อนหลัง'];
    const buttons = Array.from(nav.querySelectorAll(':scope > button'));
    const picked = wanted.map((label) => buttons.find((button) => (button.textContent || '').includes(label))).filter(Boolean);
    const pickedSignature = picked.map((button) => (button.textContent || '').trim()).join('|');
    const currentSignature = Array.from(nav.querySelectorAll(':scope > button')).map((button) => (button.textContent || '').trim()).join('|');
    if (nav.dataset.npMenuOrderSignature === currentSignature && currentSignature.startsWith(pickedSignature)) return;
    if (picked.every((button, index) => buttons[index] === button)) {
      nav.dataset.npMenuOrderSignature = currentSignature;
      markSidebarSections(nav);
      return;
    }
    picked.forEach((button) => nav.append(button));
    nav.dataset.npMenuOrderSignature = Array.from(nav.querySelectorAll(':scope > button')).map((button) => (button.textContent || '').trim()).join('|');
    markSidebarSections(nav);
  }

  function packageLimitText(value, unit) {
    return Number(value || 0) > 0 ? `${fmtAdsNumber(value)}${unit ? ' ' + unit : ''}` : 'ไม่จำกัด';
  }

  function visibleLibraryVideos() {
    const seen = new Set();
    const cards = Array.from(document.querySelectorAll('.library-card,.video-card')).filter((card) => {
      const text = card.textContent || '';
      if (!(text.includes('เล่นวิดีโอ') || text.includes('ขนาดไฟล์') || text.includes('MP4'))) return false;
      const video = card.querySelector('video');
      const name = (card.querySelector('.library-info strong,strong')?.textContent || '').trim();
      const key = card.dataset.libraryId || video?.getAttribute('src') || `${name}:${text.match(/([\d,.]+)\s*MB/i)?.[1] || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const totalMb = cards.reduce((sum, card) => {
      const text = card.textContent || '';
      const match = text.match(/([\d,.]+)\s*MB/i);
      return sum + (match ? Number(match[1].replace(/,/g, '')) || 0 : 0);
    }, 0);
    return { count: cards.length, totalMb };
  }

  function activePendingLibraryUploadCount() {
    return [...pendingUploadStore().values()].filter((item) => item && item.phase !== 'complete' && item.phase !== 'error').length;
  }

  async function getLibraryQuotaSnapshot() {
    const statusPromise = window.rerun?.getLicenseStatus?.().catch(() => null);
    const listPromise = window.rerun?.listLibrary?.().catch(() => null);
    const [status, list] = await Promise.all([statusPromise, listPromise]);
    const limit = Number(status?.videoLimit);
    const savedCount = Array.isArray(list) ? list.length : visibleLibraryVideos().count;
    const pendingCount = activePendingLibraryUploadCount();
    return {
      limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null,
      used: savedCount + pendingCount,
      savedCount,
      pendingCount
    };
  }

  async function canStartLibraryUpload({announce = true} = {}) {
    const quota = await getLibraryQuotaSnapshot();
    if (quota.limit !== null && quota.used >= quota.limit) {
      if (announce) {
        notify(`ครบแพ็กเกจแล้วค่ะ เพิ่มวิดีโอได้สูงสุด ${fmtAdsNumber(quota.limit)} ไฟล์ ตอนนี้ครบ ${fmtAdsNumber(quota.savedCount)}/${fmtAdsNumber(quota.limit)} ไฟล์แล้ว`, 'warning');
      }
      return false;
    }
    return true;
  }

  let libraryQuotaButtonRequest = 0;
  async function syncLibraryUploadButton() {
    const requestId = ++libraryQuotaButtonRequest;
    const button = getLibraryPage()?.querySelector('[data-np-library-upload]');
    if (!button) return;
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.title = 'เพิ่มวิดีโอเข้าคลัง';
    const quota = await getLibraryQuotaSnapshot();
    if (requestId !== libraryQuotaButtonRequest) return;
    const full = quota.limit !== null && quota.used >= quota.limit;
    button.disabled = full;
    button.toggleAttribute('aria-disabled', full);
    button.title = full
      ? `แพ็กเกจเต็มแล้ว ${fmtAdsNumber(quota.used)}/${fmtAdsNumber(quota.limit)} ไฟล์`
      : 'เพิ่มวิดีโอเข้าคลัง';
    button.dataset.npQuotaFull = full ? '1' : '0';
  }

  function storageDateText(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleDateString('th-TH');
  }

  function syncStoragePackageStrip() {
    if (!isLibrarySectionActive()) return;
    const intro = Array.from(document.querySelectorAll('.page-intro')).find((item) => (item.textContent || '').includes('คลังวิดีโอ'));
    if (!intro) return;
    intro.classList.remove('np-storage-intro');
    intro.style.setProperty('display', 'none', 'important');
    const addButton = Array.from(intro.querySelectorAll('button')).find((button) => (button.textContent || '').includes('เพิ่มวิดีโอ'));
    if (addButton) addButton.classList.add('primary-button');
    const existing = document.querySelector('[data-np-storage-package]');
    const currentVisible = visibleLibraryVideos();
    if (existing?.dataset?.npStorageFilled === '1' && existing.dataset.npVideoCount === String(currentVisible.count)) return;
    if (existing) existing.remove();
    const strip = document.createElement('section');
    strip.className = 'np-storage-package-strip';
    strip.dataset.npStoragePackage = '1';
    strip.innerHTML = `<div class="np-storage-plan"><span class="np-storage-icon">S</span><span><b class="np-storage-kicker">โหลดแพ็กเกจ...</b><strong class="np-storage-title">กำลังตรวจสอบข้อมูล</strong><small class="np-storage-sub">กำลังอ่านสิทธิ์พื้นที่จัดเก็บ</small></span></div>`;
    intro.insertAdjacentElement('afterend', strip);
    topupFetch('/api/topup/overview').then((state) => {
      const p = state.currentPackage || {};
      const visible = visibleLibraryVideos();
      const videoLimit = Number(p.videoLimit || 0);
      const remaining = videoLimit > 0 ? Math.max(videoLimit - visible.count, 0) : null;
      const percent = videoLimit > 0 ? Math.min(100, Math.round((visible.count / videoLimit) * 100)) : 0;
      const videoQuotaText = videoLimit > 0 ? `${fmtAdsNumber(visible.count)} / ${fmtAdsNumber(videoLimit)} ไฟล์` : `${fmtAdsNumber(visible.count)} ไฟล์`;
      const expiresText = storageDateText(p.expiresAt);
      strip.dataset.npStorageFilled = '1';
      strip.dataset.npVideoCount = String(visible.count);
      strip.innerHTML = `
        <div class="np-storage-plan">
          <span class="np-storage-icon">${(p.name || 'S').trim().slice(0, 1).toUpperCase()}</span>
          <span><b class="np-storage-kicker">แพ็กเกจปัจจุบัน</b><strong class="np-storage-title">${p.name || 'Starter'}</strong><small class="np-storage-sub">${expiresText ? `หมดอายุ ${expiresText}` : `${Number(p.durationDays || 0) > 0 ? fmtAdsNumber(p.durationDays) + ' วัน' : 'ตลอดชีพ'}`}</small></span>
        </div>
        <div class="np-storage-metric"><span>โควตาวิดีโอ</span><strong>${packageLimitText(p.videoLimit, '')}</strong></div>
        <div class="np-storage-metric"><span>ใช้งานแล้ว</span><strong>${fmtAdsNumber(visible.count)}</strong></div>
        <div class="np-storage-metric"><span>คงเหลือ</span><strong>${remaining === null ? 'ไม่จำกัด' : fmtAdsNumber(remaining)}</strong></div>
        <div class="np-storage-meter">
          <div class="np-storage-meter-top"><span><strong>จำนวนวิดีโอในคลัง</strong><small>${videoQuotaText}</small></span><span class="np-storage-meter-right">ขนาดต่อคลิปสูงสุด ${packageLimitText(p.clipSizeGb, 'GB')}</span></div>
          <div class="np-storage-bar"><i style="width:${percent}%"></i></div>
          <div class="np-storage-foot">${expiresText ? `เหลือถึง ${expiresText}` : 'แพ็กเกจปัจจุบัน'}</div>
        </div>
      `;
    }).catch(() => {
      strip.innerHTML = `<div class="np-storage-plan"><span class="np-storage-icon">S</span><span><b class="np-storage-kicker">แพ็กเกจปัจจุบัน</b><strong class="np-storage-title">โหลดข้อมูลไม่ได้</strong><small class="np-storage-sub">กรุณาลองรีเฟรชอีกครั้ง</small></span></div>`;
    });
  }

  function syncLibraryToolbar() {
    const page = getLibraryPage();
    if (!page) return;
    const grid = ensureLibraryGrid();
    if (page.querySelector('[data-np-library-toolbar]')) return;
    const introButton = Array.from(page.querySelectorAll('.library-hero button,.page-intro button')).find((button) => (button.textContent || '').includes('เพิ่มวิดีโอ'));
    const toolbar = document.createElement('div');
    toolbar.className = 'np-library-toolbar';
    toolbar.dataset.npLibraryToolbar = '1';
    toolbar.innerHTML = `
      <input class="np-library-search" type="search" placeholder="ค้นหาตามชื่อไฟล์..." data-np-library-search>
      <span class="np-library-toolbar-spacer"></span>
      <button class="np-library-upload-main" type="button" data-np-library-upload>อัปโหลดวิดีโอ</button>
      <label class="np-library-sort-label">เรียงตาม:
        <select class="np-library-sort" data-np-library-sort>
          <option value="date">วันที่</option>
          <option value="name">ชื่อไฟล์</option>
          <option value="size">ขนาดไฟล์</option>
        </select>
        <span class="np-library-sort-icon">↓</span>
      </label>
    `;
    const packageStrip = page.querySelector('[data-np-storage-package]');
    if (packageStrip) packageStrip.insertAdjacentElement('afterend', toolbar);
    else grid.insertAdjacentElement('beforebegin', toolbar);
    toolbar.querySelector('[data-np-library-upload]')?.addEventListener('click', () => {
      if (toolbar.querySelector('[data-np-library-upload]')?.disabled) return;
      if (introButton) introButton.click();
      else runLibraryUpload(true);
    });
    syncLibraryUploadButton();
    const apply = () => {
      const query = (toolbar.querySelector('[data-np-library-search]')?.value || '').trim().toLowerCase();
      const mode = toolbar.querySelector('[data-np-library-sort]')?.value || 'date';
      const cards = Array.from(grid.querySelectorAll('.library-card,.np-library-pending-card'));
      cards.forEach((card) => {
        const name = (card.querySelector('.library-info strong,.np-library-card-body strong')?.textContent || card.textContent || '').toLowerCase();
        card.style.display = !query || name.includes(query) ? '' : 'none';
      });
      const sorted = cards.slice().sort((a, b) => {
        const textA = a.textContent || '';
        const textB = b.textContent || '';
        if (mode === 'name') return textA.localeCompare(textB, 'th');
        if (mode === 'size') {
          const mbA = Number((textA.match(/([\d,.]+)\s*MB/i)?.[1] || '0').replace(/,/g, ''));
          const mbB = Number((textB.match(/([\d,.]+)\s*MB/i)?.[1] || '0').replace(/,/g, ''));
          return mbB - mbA;
        }
        return 0;
      });
      if (mode !== 'date') sorted.forEach((card) => grid.append(card));
    };
    toolbar.querySelector('[data-np-library-search]')?.addEventListener('input', apply);
    toolbar.querySelector('[data-np-library-sort]')?.addEventListener('change', apply);
    hideLibraryEmptyState();
  }

  let libraryHydratePending = false;
  let libraryHydrateLastRun = 0;
  async function hydrateLibraryFromServer(force = false) {
    const page = getLibraryPage();
    if (!page || !window.rerun?.listLibrary || libraryHydratePending) return;
    const now = Date.now();
    if (!force && now - libraryHydrateLastRun < 2500) return;
    const grid = ensureLibraryGrid();
    const visibleCards = grid ? grid.querySelectorAll('.library-card').length : 0;
    const placeholderVisible = Array.from(page.querySelectorAll('.placeholder-page,.placeholder-page.inline')).some((node) => !node.hidden && getComputedStyle(node).display !== 'none' && (node.textContent || '').includes('ยังไม่มีวิดีโอในคลัง'));
    if (!force && visibleCards > 0 && !placeholderVisible) {
      hydratePendingLibraryJobs();
      syncPendingLibraryCards();
      return;
    }
    libraryHydratePending = true;
    libraryHydrateLastRun = now;
    try {
      const items = await window.rerun.listLibrary();
      if (Array.isArray(items) && items.length) {
        renderLibraryDom(items);
        syncLibraryToolbar();
        hideLibraryEmptyState();
      }
      hydratePendingLibraryJobs(true);
    } catch (error) {
      console.warn('[np-live-patch] library hydrate failed', error);
    } finally {
      libraryHydratePending = false;
    }
  }

  function fastHydrateLibrary(reason = 'fast') {
    if (!isLibrarySectionActive()) {
      cleanupLibraryDomOutsideLibraryPage();
      return;
    }
    const now = Date.now();
    if (!window.__npLibraryFastHydrateAt) window.__npLibraryFastHydrateAt = 0;
    if (reason !== 'startup' && now - window.__npLibraryFastHydrateAt < 2500) return;
    window.__npLibraryFastHydrateAt = now;
    const delays = [0, 120, 420, 900];
    delays.forEach((delay) => {
      window.setTimeout(() => {
        try {
          syncStoragePackageStrip();
          syncLibraryToolbar();
          hydratePendingLibraryJobs(true);
          hydrateLibraryFromServer(true);
        } catch (error) {
          console.warn('[np-live-patch] fast library hydrate failed', reason, error);
        }
      }, delay);
    });
  }

  function installLibraryFastHydrateTriggers() {
    if (window.__npLibraryFastHydrateInstalled) return;
    window.__npLibraryFastHydrateInstalled = true;
    window.addEventListener('focus', () => fastHydrateLibrary('focus'));
    window.addEventListener('pageshow', () => fastHydrateLibrary('pageshow'));
    document.addEventListener('click', (event) => {
      const target = event.target?.closest?.('button,a,[role="button"],nav *');
      if (!target) return;
      const text = target.textContent || '';
      if (text.includes('คลังวิดีโอ') || (isLibrarySectionActive() && (text.includes('อัปโหลดวิดีโอ') || text.includes('เพิ่มวิดีโอ')))) {
        fastHydrateLibrary('library-click');
      }
    }, true);
  }

  function syncLiveResetButtonPosition() {
    const intro = Array.from(document.querySelectorAll('.page-intro')).find((item) => (item.textContent || '').includes('บัญชีไลฟ์'));
    if (!intro) {
      document.querySelectorAll('.np-live-reset-top').forEach((button) => button.classList.remove('np-live-reset-top'));
      return;
    }
    const resetButton = Array.from(intro.querySelectorAll('button')).find((button) => (button.textContent || '').includes('เริ่มตั้งค่าใหม่'));
    document.querySelectorAll('.np-live-reset-top').forEach((button) => {
      if (button !== resetButton) button.classList.remove('np-live-reset-top');
    });
    resetButton?.classList.add('np-live-reset-top');
  }

  function syncSettingsCleanLayout() {
    document.querySelectorAll('.settings-page').forEach((page) => {
      const text = page.textContent || '';
      const isSystemSettings = text.includes('เครื่องนี้ไลฟ์ไหวแค่ไหน') || text.includes('สแกนหน้า LIVE console') || text.includes('เวอร์ชันแอป') || text.includes('อัปเดตอัตโนมัติ');
      const isLineSettings = text.includes('รับแจ้งเตือน') && text.includes('Channel access token') && text.includes('LINE');
      page.classList.toggle('np-settings-clean', isSystemSettings);
      page.classList.toggle('np-settings-line', isLineSettings);
      if (!isSystemSettings) return;
      Array.from(page.querySelectorAll('.card')).forEach((card) => {
        const cardText = card.textContent || '';
        if (cardText.includes('เครื่องนี้ไลฟ์ไหวแค่ไหน')) card.classList.add('np-settings-test-card');
        if (cardText.includes('สแกนหน้า LIVE console')) card.classList.add('np-settings-console-card');
        if (cardText.includes('เวอร์ชันแอป')) card.classList.add('np-settings-version-card');
      });
    });
  }

  function syncLiveAccountTitleless() {
    document.querySelectorAll('.page-intro').forEach((intro) => {
      const title = intro.querySelector('h1')?.textContent || '';
      const shouldHide = title.includes('บัญชีไลฟ์');
      intro.classList.toggle('np-live-account-titleless', shouldHide);
      if (shouldHide) {
        intro.dataset.npLiveAccountTitleless = '1';
        intro.style.setProperty('display','none','important');
        intro.setAttribute('aria-hidden','true');
      } else if (intro.dataset.npLiveAccountTitleless === '1') {
        delete intro.dataset.npLiveAccountTitleless;
        intro.style.removeProperty('display');
        intro.removeAttribute('aria-hidden');
      }
    });
  }

  function syncTopupMenu() {
    const nav = document.querySelector('aside nav');
    if (!nav) return;
    bindStableSidebarSwitching(nav);
    const existing = nav.querySelector('[data-np-topup-menu]');
    if (existing) {
      existing.classList.toggle('active', mainArea()?.dataset?.npTopupActive === '1');
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.npTopupMenu = '1';
    button.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/>
        <path d="M2 7h20v5H2z"/>
        <path d="M12 22V7"/>
        <path d="M12 7H7.5a2.5 2.5 0 1 1 2.2-3.7L12 7Z"/>
        <path d="M12 7h4.5a2.5 2.5 0 1 0-2.2-3.7L12 7Z"/>
      </svg>
      <span>แพ็กเกจ</span>
    `;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showTopupPage();
    });
    button.classList.toggle('active', mainArea()?.dataset?.npTopupActive === '1');
    const anchor = Array.from(nav.querySelectorAll('button')).find((item) => item.textContent.includes('คลังวิดีโอ') || item.textContent.includes('บัญชีไลฟ์'));
    if (anchor?.nextSibling) nav.insertBefore(button, anchor.nextSibling);
    else nav.append(button);
    orderMainSidebar(nav);
  }

  function cleanLicenseUiText() {
    const login = document.querySelector('.license-card');
    if (login) {
      const sub = login.querySelector('.license-sub');
      if (sub) sub.textContent = 'เข้าสู่ระบบด้วย User และ Password หรือสมัครสมาชิกเพื่อเริ่มใช้งาน';
    }
    document.querySelectorAll('.sidebar-bottom button').forEach((button) => {
      const text = button.textContent || '';
      if (text.includes('จัดการ License Key')) {
        button.querySelector('span') ? button.querySelector('span').textContent = 'จัดการผู้ใช้' : button.textContent = 'จัดการผู้ใช้';
      }
    });
    document.querySelectorAll('.login-error').forEach((node) => {
      if ((node.textContent || '').includes('ไลเซนส์')) {
        node.textContent = node.textContent.replace(/ไลเซนส์ที่ใช้งานได้/g, 'บัญชีที่ใช้งานได้').replace(/ไลเซนส์/g, 'บัญชี');
      }
    });
  }

  let topbarUserLastFetch = 0;
  let topbarUserPending = null;

  function localActiveUsername() {
    const raw = window.__npActiveUsername || localStorage.getItem('np.active.username') || '';
    return String(raw || '').trim();
  }

  function setTopbarUsername(name) {
    const chip = document.querySelector('[data-np-topbar-user]');
    if (!chip) return;
    const strong = chip.querySelector('strong');
    if (strong) strong.textContent = name || 'กำลังอ่านผู้ใช้';
    chip.title = name ? `เข้าสู่ระบบด้วย ${name}` : 'กำลังอ่านชื่อผู้ใช้';
  }

  function syncTopbarUsername() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) return;
    if (!document.querySelector('[data-np-topbar-user]')) {
      const chip = document.createElement('div');
      chip.className = 'np-topbar-user';
      chip.dataset.npTopbarUser = '1';
      chip.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 21a8 8 0 0 0-16 0"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span><small>ผู้ใช้ที่เข้าสู่ระบบ</small><strong>กำลังอ่านผู้ใช้</strong></span>
      `;
      const engine = topbar.querySelector('.engine-pill');
      const spacer = topbar.querySelector('.top-spacer');
      if (engine) topbar.insertBefore(chip, engine);
      else if (spacer?.nextSibling) topbar.insertBefore(chip, spacer.nextSibling);
      else if (spacer) topbar.insertBefore(chip, spacer);
      else topbar.append(chip);
    }
    const localName = localActiveUsername();
    if (localName) {
      setTopbarUsername(localName);
      return;
    }
    const now = Date.now();
    if (!window.rerun?.getLicenseStatus || topbarUserPending || now - topbarUserLastFetch < 3000) return;
    topbarUserLastFetch = now;
    topbarUserPending = window.rerun.getLicenseStatus()
      .then((status) => {
        const name = status?.username || status?.displayName || localActiveUsername();
        if (name) setTopbarUsername(name);
      })
      .catch(() => {})
      .finally(() => { topbarUserPending = null; });
  }

  function safeParseJson(text, fallback) {
    try { return JSON.parse(text); } catch { return fallback; }
  }

  function unscopedStreamAccountId(accountId) {
    const raw = String(accountId || 'main').trim() || 'main';
    const username = localActiveUsername().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const prefix = username ? `${username}__` : '';
    return prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) || 'main' : raw;
  }

  function videoNameFromPath(filePath) {
    return String(filePath || '').split(/[\\/]/).pop() || 'video.mp4';
  }

  function buildRecoveredAccount(item, existing) {
    const config = item?.config || {};
    const status = item?.status || { state: 'idle', message: 'พร้อมใช้งาน' };
    const id = unscopedStreamAccountId(item?.accountId || config.accountId || existing?.id || 'main');
    const videos = Array.isArray(item?.videos) && item.videos.length
      ? item.videos
      : (Array.isArray(config.videoPaths) ? config.videoPaths.map((path) => ({ path, name: videoNameFromPath(path) })) : []);
    const wasRunning = status.state === 'live' || status.state === 'starting';
    const liveTitle = String(config.liveTitle || existing?.liveTitle || '').trim();
    const existingAlias = String(existing?.alias || '').trim();
    const recoveredAlias = existingAlias && existingAlias !== liveTitle
      ? existingAlias
      : String(config.alias || config.accountName || config.displayName || id || '').trim();
    return {
      ...(existing || {}),
      id,
      alias: recoveredAlias || id,
      connected: existing?.connected ?? false,
      step: wasRunning ? 6 : Math.max(Number(existing?.step || 1), videos.length ? 3 : 1),
      maxStep: Math.max(Number(existing?.maxStep || 1), 6),
      targetMode: config.targetMode || existing?.targetMode || 'tiktok',
      liveTitle,
      server: config.rtmpServer || existing?.server || '',
      streamKey: config.streamKey || existing?.streamKey || '',
      bitrate: Number(config.bitrateKbps || existing?.bitrate || 4500),
      shuffleEnabled: videos.length > 1 && config.shuffleEnabled === true,
      camera: config.camera || existing?.camera || { zoom: 1, panX: 0, panY: 0, mirror: false },
      overlays: Array.isArray(config.overlays) ? config.overlays : (Array.isArray(existing?.overlays) ? existing.overlays : []),
      clocks: Array.isArray(config.clocks) ? config.clocks : (Array.isArray(existing?.clocks) ? existing.clocks : []),
      texts: Array.isArray(config.texts) ? config.texts : (Array.isArray(existing?.texts) ? existing.texts : []),
      videoList: videos.map((video) => ({
        path: video.path,
        name: video.name || videoNameFromPath(video.path),
        mediaUrl: video.mediaUrl || video.url || existing?.videoList?.find?.((item) => item.path === video.path)?.mediaUrl || '',
        size: video.size || existing?.videoList?.find?.((item) => item.path === video.path)?.size || 0,
      })),
      status,
    };
  }

  function isBlankOverlayStep() {
    const step = Array.from(document.querySelectorAll('.step.active')).find((item) => (item.textContent || '').includes('โอเวอร์เลย์'));
    if (!step) return false;
    const host = stepHost();
    if (!host) return false;
    if (host.querySelector('.overlay-layout,.preview-card,.overlay-controls,.portrait-stage')) return false;
    return !(host.textContent || '').trim();
  }

  let streamHydratePending = false;
  async function hydrateStreamAccountsFromServer(options = {}) {
    if (isRemoteWebWorkspace() || streamHydratePending || !window.rerun?.listStreamConfigs) return;
    const forceCleared = options.forceCleared === true;
    const reload = options.reload !== false;
    streamHydratePending = true;
    try {
      const items = await window.rerun.listStreamConfigs();
      if (!Array.isArray(items) || !items.length) return;
      const current = safeParseJson(localStorage.getItem('rerun.accounts') || '[]', []);
      const accounts = Array.isArray(current) ? current : [];
      const byId = new Map(accounts.filter(Boolean).map((account) => [String(account.id || 'main'), account]));
      for (const item of items) {
        const id = unscopedStreamAccountId(item?.accountId || item?.config?.accountId || 'main');
        if (!forceCleared && isMainVideoCleared(id)) continue;
        if (forceCleared) setMainVideoCleared(id, false);
        const existing = byId.get(id);
        byId.set(id, buildRecoveredAccount(item, existing));
      }
      const nextAccounts = Array.from(byId.values());
      const before = JSON.stringify(accounts);
      const after = JSON.stringify(nextAccounts);
      if (before !== after) {
        localStorage.setItem('rerun.accounts', after);
        window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: after }));
        window.dispatchEvent(new CustomEvent('np:stream-configs-hydrated'));
      }
    } catch (error) {
      console.warn('[np-live-patch] stream hydrate failed', error);
    } finally {
      streamHydratePending = false;
    }
  }

  function recoverBlankOverlayStep() {
    if (!isBlankOverlayStep()) return;
    hydrateStreamAccountsFromServer({ forceCleared: true }).catch((error) => {
      console.warn('[np-live-patch] blank overlay recover failed', error);
    });
  }

  function hardenLoginPasswordFields() {
    const login = document.querySelector('.license-card');
    if (!login) return;
    login.setAttribute('autocomplete', 'on');
    login.removeAttribute('data-form-type');
    const username = login.querySelector('#license-username');
    if (username) {
      username.setAttribute('name', 'username');
      username.setAttribute('autocomplete', 'username');
      username.setAttribute('autocapitalize', 'none');
      username.setAttribute('spellcheck', 'false');
      username.removeAttribute('data-lpignore');
      username.removeAttribute('data-1p-ignore');
      username.removeAttribute('data-form-type');
    }
    const password = login.querySelector('#license-password');
    if (password) {
      password.setAttribute('name', 'password');
      password.setAttribute('autocomplete', 'current-password');
      password.setAttribute('autocapitalize', 'none');
      password.setAttribute('spellcheck', 'false');
      password.removeAttribute('data-lpignore');
      password.removeAttribute('data-1p-ignore');
      password.removeAttribute('data-form-type');
    }
  }

  function tick() {
    addStyle();
    hideTikTokRejectNotice();
    syncRegistrationGate();
    const nav = document.querySelector('aside nav');
    if (nav) {
      syncAdsSidebarMenu();
      syncTopupMenu();
      orderMainSidebar(nav);
      syncPackageGate(nav);
    }
    syncAccountsBarVisibility();
    if (mainArea()?.dataset?.npTopupActive === '1') return;
    if (REACT_DOM_PATCHES_ENABLED) {
      removeWrongPanels();
      compactPageCopy();
      compactVideoStepCopy();
      unlockLiveUiPreviewStep();
      polishLiveRunningStep();
      patchLiveUiPreviewCopy();
    }
    markActiveAccountControl();
    cleanupLibraryDomOutsideLibraryPage();
    syncStoragePackageStrip();
    syncLibraryToolbar();
    hydrateLibraryFromServer();
    hydratePendingLibraryJobs();
    syncPendingLibraryCards();
    hideLibraryEmptyState();
    syncLiveResetButtonPosition();
    syncSettingsCleanLayout();
    syncLiveAccountTitleless();
    syncSidebarActiveHighlight();
    enhanceAdsPage();
    if (REACT_DOM_PATCHES_ENABLED) compactConnectTikTokStep();
    hookLibraryUploadFlow();
    makeOldLibraryDropClickable();
    hookLibraryPlayDelegation();
    polishLibraryCards();
    injectCustomerTester();
    if (REACT_DOM_PATCHES_ENABLED) {
      injectVideoQueuePanel();
      bindMainVideoRemoveButtons();
      interceptVideoFileDropzonePicker();
      unlockVideoStepNextButton();
      schedulePersistCurrentVideoConfig();
      injectSchedulePanel();
      syncScheduleAccount();
      repairOverlayVideoPreview();
      recoverBlankOverlayStep();
    }
    patchDashboardSalesCard();
    cleanLicenseUiText();
    hardenLoginPasswordFields();
    syncTopbarUsername();
  }

  function hideTikTokRejectNotice() {
    const rejectPattern = /TikTok\s+ปฏิเสธการส่งสตรีมแล้ว/;
    const nodes = document.querySelectorAll('div,p,span,small,strong');
    for (const node of nodes) {
      const text = (node.textContent || '').trim();
      if (!rejectPattern.test(text)) continue;
      const target = node.closest('.login-error,.clip-warning,.warning-note,[role="alert"]') || node;
      if (target.querySelector('button,a,input,select,textarea')) continue;
      const rect = target.getBoundingClientRect();
      if (rect.height && rect.height > 180) continue;
      target.style.setProperty('display', 'none', 'important');
    }
  }

  function safeTick() {
    try {
      tick();
    } catch (error) {
      console.warn('[np-live-patch] tick failed', error);
    }
  }

  function startPatchLoop() {
    hydrateStreamAccountsFromServer();
    installLibraryFastHydrateTriggers();
    if (REACT_DOM_PATCHES_ENABLED) installMainVideoRemoveDelegation();
    fastHydrateLibrary('startup');
    safeTick();
    let tickQueued = false;
    const scheduleTick = () => {
      if (tickQueued) return;
      tickQueued = true;
      window.setTimeout(() => {
        tickQueued = false;
        safeTick();
      }, 120);
    };
    const observer = new MutationObserver(() => scheduleTick());
    observer.observe(document.body, { childList: true, subtree: true });
    window.setInterval(scheduleTick, 3500);
  }

  function installBlankScreenRecovery() {
    let confirmedBlankChecks = 0;
    const resetClientSession = () => {
      try { sessionStorage.removeItem('np.session.switch.reason'); } catch {}
    };
    const isActuallyBlank = () => {
      const root = document.getElementById('root');
      if (!root) return false;
      if (document.readyState !== 'complete') return false;
      if (document.querySelector('.license-card,.license-gate,.app-shell,.np-blank-recovery')) return false;
      const rootText = (root.innerText || '').trim();
      const bodyText = (document.body.innerText || '').trim();
      return !root.children.length || (!rootText && !bodyText);
    };
    const recover = () => {
      if (!isActuallyBlank()) {
        confirmedBlankChecks = 0;
        return;
      }
      confirmedBlankChecks += 1;
      if (confirmedBlankChecks < 2) return;
      resetClientSession();
      if (document.querySelector('.np-blank-recovery')) return;
      const wrap = document.createElement('section');
      wrap.className = 'np-blank-recovery';
      wrap.style.cssText = 'position:fixed;inset:0;z-index:999999;display:grid;place-items:center;padding:24px;background:#060911;color:#f5f8ff;font-family:system-ui,"Noto Sans Thai",sans-serif';
      wrap.innerHTML = `
        <div style="width:min(460px,100%);border:1px solid rgba(43,139,255,.45);border-radius:16px;background:linear-gradient(135deg,#071525,#070a11);padding:24px;box-shadow:0 26px 90px rgba(0,0,0,.45)">
          <h2 style="margin:0 0 8px;font-size:24px">หน้าเว็บโหลดไม่ครบ</h2>
          <p style="margin:0 0 18px;color:#b8c9e2;line-height:1.6">ระบบกันไม่ให้จอดำล้วนแล้ว กรุณาโหลดหน้าใหม่หนึ่งครั้ง หากยังเป็นอีกให้แจ้งเวลาที่เกิดเพื่อไล่ console ต่อได้ทันที</p>
          <button type="button" data-reset style="width:100%;height:44px;border:0;border-radius:10px;background:linear-gradient(135deg,#ffd25d,#f2a900);color:#05070c;font-weight:950;cursor:pointer">โหลดหน้าใหม่</button>
        </div>
      `;
      wrap.querySelector('[data-reset]').addEventListener('click', async () => {
        resetClientSession();
        location.replace(location.pathname + location.search + location.hash);
      });
      document.body.append(wrap);
    };
    window.addEventListener('error', () => window.setTimeout(recover, 1800));
    window.addEventListener('unhandledrejection', () => window.setTimeout(recover, 1800));
    window.setTimeout(recover, 6500);
    window.setTimeout(recover, 11000);
    window.setTimeout(recover, 18000);
  }

  function currentStreamAccountId() {
    try {
      const items = JSON.parse(localStorage.getItem('rerun.accounts') || '[]');
      const selected = sessionStorage.getItem('np.selected.accountId') || localStorage.getItem('np.selected.accountId') || '';
      if (selected) return String(selected);
      const first = Array.isArray(items) ? items.find(item => item && item.id) : null;
      return String(first?.id || 'main');
    } catch {
      return 'main';
    }
  }

  const liveChatViewerState = {
    busy: false,
    seen: new Map(),
    comments: [],
    lastAccountId: '',
    liveKey: '',
    scopedAccountId: '',
    scopedAccountAt: 0,
  };

  const LIVE_CHAT_UI_REJECT = /(Viewer comments will appear|ความคิดเห็นของผู้ชมจะปรากฏ|กิจกรรมของผู้ชมจะปรากฏ|Product related|เกี่ยวข้องกับสินค้า|Type something|Welcome to TikTok|Community Guidelines|Orders placed|All activities|Activity|Suggestion|Fresh ideas|Analytics|Attributed GMV|Current viewers|Avg\. viewing|Product clicks|Tap-through|LIVE console|Product list|No products yet|Add products|Giveaway|Flash sale|Coupon|Billboard|ทั้งหมด|แชท|A\+|A-|All\b|Chat\b|0\/100|just joined|18\+|Next|Support|Log in|Join now|Pet supplies|LIVE shopping|Home improvement|How do I go LIVE|Cookie policy|Turning TikTok trends)/i;

  function readCookie(name) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`).exec(document.cookie || '');
    return match ? decodeURIComponent(match[1]) : '';
  }

  async function invokeNp(channel, args = []) {
    const csrf = readCookie('np_csrf');
    const response = await fetch('/api/invoke', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'x-np-web': '1',
        'x-np-csrf': csrf,
      },
      body: JSON.stringify({ channel, args }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || `HTTP ${response.status}`));
    return data?.result;
  }

  async function scopedStreamAccountId(baseAccountId) {
    const now = Date.now();
    if (liveChatViewerState.scopedAccountId && now - liveChatViewerState.scopedAccountAt < 60000) {
      return liveChatViewerState.scopedAccountId;
    }
    try {
      const status = await invokeNp('license:status', []);
      const username = String(status?.username || status?.displayName || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
      const raw = String(baseAccountId || 'main').replace(/^[a-z0-9_.-]+__/i, '').replace(/[^a-zA-Z0-9_.:-]/g, '_') || 'main';
      liveChatViewerState.scopedAccountId = username ? `${username}__${raw}` : raw;
      liveChatViewerState.scopedAccountAt = now;
      return liveChatViewerState.scopedAccountId;
    } catch {
      return baseAccountId;
    }
  }

  function normalizeLiveChatComment(comment) {
    const text = String(comment?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    if (LIVE_CHAT_UI_REJECT.test(text)) return null;
    if (/^[\d\s.,]+$/.test(text)) return null;
    const user = String(comment?.user || 'ผู้ชม').replace(/\s+/g, ' ').trim() || 'ผู้ชม';
    if (LIVE_CHAT_UI_REJECT.test(user)) return null;
    const role = String(comment?.role || '').replace(/\s+/g, ' ').trim();
    const key = String(comment?.key || comment?.id || `${user}|${text}`).trim();
    return { key, user, role, text, at: Number(comment?.at) || Date.now() };
  }

  function renderLiveChatViewer(message) {
    const panel = document.querySelector('.chat-live-panel');
    if (!panel) return;
    const state = panel.querySelector('.chat-live-state');
    if (state) {
      state.classList.add('on');
      state.textContent = 'อ่านแชทสด';
    }
    const log = panel.querySelector('.chat-live-log');
    if (!log) return;
    const comments = liveChatViewerState.comments.slice(-80);
    if (!comments.length) {
      log.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'chat-live-empty';
      empty.textContent = message || 'กำลังรอคอมเมนต์จากผู้ชม…';
      log.append(empty);
      return;
    }
    log.innerHTML = '';
    for (const item of comments) {
      const row = document.createElement('div');
      row.className = 'chat-line incoming';
      const user = document.createElement('span');
      user.className = 'chat-user';
      user.textContent = item.role ? `${item.user} ${item.role}` : item.user;
      const body = document.createElement('span');
      body.className = 'chat-body';
      body.textContent = item.text;
      row.append(user, body);
      log.append(row);
    }
    const end = document.createElement('div');
    log.append(end);
    try { end.scrollIntoView({ block: 'end' }); } catch {}
  }

  function resetLiveChatViewer(message) {
    liveChatViewerState.seen.clear();
    liveChatViewerState.comments = [];
    renderLiveChatViewer(message || 'กำลังรอคอมเมนต์ใหม่จากไลฟ์นี้…');
  }

  function liveChatSessionKey(accountId, status) {
    const state = String(status?.state || '');
    if (state !== 'starting' && state !== 'live') return '';
    const startedAt = Number(status?.startedAt) || 0;
    const roomId = String(status?.roomId || status?.tiktokRoomId || status?.room_id || '').trim();
    return `${accountId || 'main'}|${roomId || startedAt || 'active'}`;
  }

  function syncLiveChatViewerSession(status, accountId = currentStreamAccountId()) {
    const state = String(status?.state || '');
    if (state === 'idle' || state === 'stopping') {
      if (liveChatViewerState.liveKey || liveChatViewerState.comments.length) {
        liveChatViewerState.liveKey = '';
        resetLiveChatViewer('กำลังรอคอมเมนต์ใหม่จากไลฟ์ถัดไป…');
      }
      return;
    }
    const nextKey = liveChatSessionKey(accountId, status);
    if (!nextKey) return;
    if (liveChatViewerState.liveKey !== nextKey) {
      liveChatViewerState.liveKey = nextKey;
      resetLiveChatViewer('กำลังรอคอมเมนต์ใหม่จากไลฟ์นี้…');
    }
  }

  async function pollLiveChatViewer() {
    const panel = document.querySelector('.chat-live-panel');
    if (!panel || liveChatViewerState.busy) return;
    const accountId = currentStreamAccountId();
    if (liveChatViewerState.lastAccountId && liveChatViewerState.lastAccountId !== accountId) {
      liveChatViewerState.liveKey = '';
      resetLiveChatViewer('กำลังรอคอมเมนต์ใหม่จากบัญชีนี้…');
    }
    liveChatViewerState.lastAccountId = accountId;
    liveChatViewerState.busy = true;
    try {
      let rawComments = [];
      const scopedAccountId = await scopedStreamAccountId(accountId);
      const httpApi = await invokeNp('debug:live-chat-api', [scopedAccountId]).catch(() => null);
      rawComments = Array.isArray(httpApi?.decoded?.comments) ? httpApi.decoded.comments : [];
      if (!rawComments.length && window.rerun?.debugLiveChatApi) {
        const apiResult = await window.rerun.debugLiveChatApi(accountId).catch(() => null);
        rawComments = Array.isArray(apiResult?.decoded?.comments) ? apiResult.decoded.comments : [];
      }
      let added = 0;
      for (const raw of rawComments) {
        const comment = normalizeLiveChatComment(raw);
        if (!comment || liveChatViewerState.seen.has(comment.key)) continue;
        liveChatViewerState.seen.set(comment.key, comment.at);
        liveChatViewerState.comments.push(comment);
        added += 1;
      }
      if (liveChatViewerState.comments.length > 120) liveChatViewerState.comments = liveChatViewerState.comments.slice(-120);
      if (liveChatViewerState.seen.size > 240) {
        const keep = new Set(liveChatViewerState.comments.map(item => item.key));
        for (const key of liveChatViewerState.seen.keys()) {
          if (!keep.has(key)) liveChatViewerState.seen.delete(key);
        }
      }
      renderLiveChatViewer(rawComments.length || liveChatViewerState.comments.length ? undefined : 'กำลังอ่านจาก TikTok LIVE Manager…');
      if (added && window.rerun?.recoverChatReaders) {
        // Best effort: if the server was restarted during a live, this nudges its event readers
        // back on while the read-only DOM scan keeps the UI alive.
        window.rerun.recoverChatReaders().catch(() => {});
      }
    } catch {
      renderLiveChatViewer('ยังอ่านแชทจาก TikTok ไม่ได้ กำลังลองใหม่…');
    } finally {
      liveChatViewerState.busy = false;
    }
  }

  function patchLiveStatusText(status) {
    if (!status) return;
    const state = String(status.state || '');
    const isTikTokRejectNotice = text => /TikTok\s+ปฏิเสธการส่งสตรีมแล้ว/.test(text);
    const replacements = state === 'live'
      ? [
        [/^กำลังเชื่อมต่อ\s*RTMP\.{0,3}$/i, 'กำลังไลฟ์'],
        [/^กำลังเชื่อมต่อ\s*RTMP…$/i, 'กำลังไลฟ์'],
        [/^ไม่มีสตรีมที่กำลังทำงาน$/i, 'กำลังไลฟ์'],
        [/^กำลังเริ่มไลฟ์$/i, 'กำลังไลฟ์'],
        [/^กำลังหยุดไลฟ์\.{0,3}$/i, 'กำลังไลฟ์'],
        [/^รอข้อมูล$/i, 'ส่งข้อมูลแล้ว'],
        [/^กำลังเชื่อมต่อ$/i, 'ทำงานปกติ']
      ]
      : state === 'stopping'
        ? [
          [/^กำลังเชื่อมต่อ\s*RTMP\.{0,3}$/i, 'หยุดไลฟ์แล้ว'],
          [/^กำลังเชื่อมต่อ\s*RTMP…$/i, 'หยุดไลฟ์แล้ว'],
          [/^กำลังไลฟ์$/i, 'หยุดไลฟ์แล้ว'],
          [/^กำลังหยุดไลฟ์\.{0,3}$/i, 'หยุดไลฟ์แล้ว'],
          [/^รอข้อมูล$/i, 'หยุดแล้ว'],
          [/^กำลังเชื่อมต่อ$/i, 'หยุดแล้ว'],
          [/^ส่งข้อมูลแล้ว$/i, 'หยุดแล้ว']
        ]
        : (state === 'idle' || state === 'error')
          ? [
            [/^กำลังเชื่อมต่อ\s*RTMP\.{0,3}$/i, 'หยุดไลฟ์แล้ว'],
            [/^กำลังเชื่อมต่อ\s*RTMP…$/i, 'หยุดไลฟ์แล้ว'],
            [/^กำลังไลฟ์$/i, 'หยุดไลฟ์แล้ว'],
            [/^กำลังหยุดไลฟ์\.{0,3}$/i, 'หยุดไลฟ์แล้ว'],
            [/^ไม่มีสตรีมที่กำลังทำงาน$/i, 'หยุดไลฟ์แล้ว'],
            [/^รอข้อมูล$/i, 'หยุดแล้ว'],
            [/^กำลังเชื่อมต่อ$/i, 'หยุดแล้ว'],
            [/^ส่งข้อมูลแล้ว$/i, 'หยุดแล้ว']
          ]
          : [];
    if (!replacements.length) return;
    const nodes = [...document.querySelectorAll('h1,h2,h3,h4,strong,span,div,p,small,button')];
    for (const node of nodes) {
      if (!node) continue;
      if ((state === 'idle' || state === 'error') && node.tagName === 'BUTTON') {
        const buttonText = (node.textContent || '').trim();
        if (/หยุดไลฟ์/.test(buttonText)) {
          const isPipelineButton = !!node.closest('.step-content.np-live-native-step .live-panel');
          const rect = node.getBoundingClientRect();
          if (!isPipelineButton && rect.width < 220) continue;
          node.textContent = 'เริ่มไลฟ์';
          node.style.setProperty('background', 'rgba(82,18,26,.92)', 'important');
          node.style.setProperty('border-color', 'rgba(255,112,112,.52)', 'important');
          node.style.setProperty('color', '#ffd8dc', 'important');
          node.style.setProperty('box-shadow', 'none', 'important');
          continue;
        }
      }
      const nodeText = (node.textContent || '').trim();
      if ((state === 'idle' || state === 'error') && isTikTokRejectNotice(nodeText)) {
        if (node.children.length) {
          const rect = node.getBoundingClientRect();
          const hasAction = !!node.querySelector('button,a,input,select,textarea');
          const hasHeading = !!node.querySelector('h1,h2,h3,h4');
          if (!hasAction && !hasHeading && rect.height > 0 && rect.height < 100) {
            node.style.setProperty('display', 'none', 'important');
            continue;
          }
        }
        if (!node.children.length) {
          node.textContent = '';
          continue;
        }
      }
      if (node.children.length) continue;
      const text = nodeText;
      if (!text) continue;
      const match = replacements.find(([pattern]) => pattern.test(text));
      if (match) node.textContent = match[1];
    }
  }

  function installLiveStatusTextSync() {
    if (window.__npLiveStatusTextSync) return;
    window.__npLiveStatusTextSync = true;
    let lastState = '';
    const apply = status => {
      if (!status) return;
      syncLiveChatViewerSession(status);
      lastState = String(status.state || lastState || '');
      patchLiveStatusText(status);
      if (lastState === 'idle') {
        document.querySelectorAll('[class*="live" i]').forEach(node => {
          const text = (node.textContent || '').trim();
          if (text === 'LIVE' || text === '● LIVE') node.style.display = 'none';
        });
      }
    };
    const poll = async () => {
      if (!window.rerun?.getStreamStatus) return;
      try {
        apply(await window.rerun.getStreamStatus(currentStreamAccountId()));
      } catch {}
    };
    if (window.rerun?.onStreamStatus) {
      try {
        window.rerun.onStreamStatus(event => {
          const status = event?.status || event;
          syncLiveChatViewerSession(status, event?.accountId || currentStreamAccountId());
          apply(status);
        });
      } catch {}
    }
    const observer = new MutationObserver(() => {
      if (lastState === 'live' || lastState === 'stopping' || lastState === 'idle') {
        window.clearTimeout(window.__npLiveStatusTextSyncTick);
        window.__npLiveStatusTextSyncTick = window.setTimeout(poll, 80);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.setInterval(poll, 1200);
    window.setTimeout(poll, 150);
    window.setTimeout(poll, 700);
    window.setTimeout(poll, 1800);
  }

  function installAuthoritativeLiveControls() {
    if (window.__npAuthoritativeLiveControls) return;
    window.__npAuthoritativeLiveControls = true;
    let lastStatus = null;
    let stopping = false;
    const accountId = () => {
      try {
        const items = JSON.parse(localStorage.getItem('rerun.accounts') || '[]');
        const first = Array.isArray(items) ? items.find(item => item && item.id) : null;
        return String(first?.id || 'main');
      } catch {
        return 'main';
      }
    };
    const ensureBar = () => {
      let bar = document.getElementById('np-live-authoritative-bar');
      if (bar) return bar;
      bar = document.createElement('section');
      bar.id = 'np-live-authoritative-bar';
      bar.style.cssText = 'position:fixed;right:22px;bottom:22px;z-index:99990;display:none;min-width:300px;max-width:min(430px,calc(100vw - 44px));padding:14px;border:1px solid rgba(52,230,168,.52);border-radius:14px;background:linear-gradient(135deg,rgba(6,23,22,.98),rgba(7,13,24,.98));box-shadow:0 24px 80px rgba(0,0,0,.48),inset 0 1px rgba(255,255,255,.07);color:#f4fbff;font-family:var(--np-ui-font,system-ui,sans-serif)';
      bar.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px">
          <div style="display:grid;gap:3px;min-width:0">
            <strong data-state style="font-size:14px;color:#79f2bd">กำลังไลฟ์</strong>
            <span data-detail style="font-size:12px;color:#bdd0e8;line-height:1.45">สถานะจริงจากระบบ</span>
          </div>
          <button type="button" data-stop style="min-width:106px;height:38px;border:1px solid rgba(255,112,112,.52);border-radius:10px;background:rgba(82,18,26,.92);color:#ffd8dc;font-weight:950;cursor:pointer">หยุดไลฟ์</button>
        </div>
      `;
      bar.querySelector('[data-stop]').addEventListener('click', async () => {
        if (stopping) return;
        const ok = window.npConfirm ? await window.npConfirm({
          title: 'หยุดไลฟ์นี้ใช่ไหม',
          message: 'ระบบจะสั่งหยุด FFmpeg และตัดการส่ง RTMP ของไลฟ์นี้',
          confirmText: 'หยุดไลฟ์',
          cancelText: 'ยกเลิก'
        }) : window.confirm('หยุดไลฟ์นี้ใช่ไหม');
        if (!ok) return;
        stopping = true;
        const btn = bar.querySelector('[data-stop]');
        btn.textContent = 'กำลังหยุด...';
        btn.disabled = true;
        try {
        const result = await window.rerun.stopStream(currentStreamAccountId());
          lastStatus = result;
          window.npNotify?.(result?.message || 'หยุดไลฟ์แล้ว', { tone: 'success' });
          await poll();
        } catch (error) {
          window.npNotify?.(error?.message || 'หยุดไลฟ์ไม่สำเร็จ', { tone: 'danger' });
        } finally {
          stopping = false;
          btn.disabled = false;
          btn.textContent = 'หยุดไลฟ์';
        }
      });
      document.body.append(bar);
      return bar;
    };
    const patchVisibleStatusText = status => {
      if (!status || status.state !== 'live') return;
      const all = [...document.querySelectorAll('h1,h2,h3,strong,span,div,p,small')];
      for (const node of all) {
        if (!node || node.children.length) continue;
        const text = (node.textContent || '').trim();
        if (/กำลังเชื่อมต่อ RTMP|ไม่มีสตรีมที่กำลังทำงาน|รอข้อมูล/.test(text)) {
          if (/RTMP|ไม่มีสตรีม/.test(text)) node.textContent = 'กำลังไลฟ์';
          else if (/รอข้อมูล/.test(text)) node.textContent = 'ส่งข้อมูลแล้ว';
        }
      }
    };
    let liveTimerStartAt = 0;
    let frozenLiveTimeText = '00:00:00';
    const formatLiveElapsed = seconds => {
      const safe = Math.max(0, Math.floor(Number(seconds) || 0));
      const h = Math.floor(safe / 3600);
      const m = Math.floor((safe % 3600) / 60);
      const s = safe % 60;
      return [h, m, s].map(value => String(value).padStart(2, '0')).join(':');
    };
    const syncLiveClock = status => {
      const timeNode = document.querySelector('.live-time');
      if (!timeNode) return;
      const shouldRun = status?.state === 'live' || status?.state === 'starting';
      if (shouldRun) {
        const startedAt = Number(status.startedAt) || liveTimerStartAt || Date.now();
        liveTimerStartAt = startedAt;
        frozenLiveTimeText = formatLiveElapsed((Date.now() - startedAt) / 1000);
        timeNode.textContent = frozenLiveTimeText;
        return;
      }
      if ((status?.state === 'idle' || status?.state === 'stopping') && frozenLiveTimeText) {
        timeNode.textContent = frozenLiveTimeText;
        return;
      }
      if (!liveTimerStartAt) timeNode.textContent = frozenLiveTimeText || '00:00:00';
    };
    const syncCurrentAccountLiveStep = (status) => {
      if (!status || (status.state !== 'live' && status.state !== 'starting')) return;
      try {
        const accountId = currentAccountId();
        const accounts = getAccounts();
        let changed = false;
        const nextAccounts = accounts.map((account) => {
          if (account.id !== accountId) return account;
          if (Number(account.step || 1) >= 6 && Number(account.maxStep || 1) >= 6) return account;
          changed = true;
          return { ...account, step: 6, maxStep: Math.max(Number(account.maxStep || 1), 6) };
        });
        if (!changed) return;
        const serialized = JSON.stringify(nextAccounts);
        localStorage.setItem('rerun.accounts', serialized);
        window.dispatchEvent(new StorageEvent('storage', { key: 'rerun.accounts', newValue: serialized }));
      } catch {}
    };
    async function poll() {
      if (!window.rerun?.getStreamStatus) return;
      try {
        const status = await window.rerun.getStreamStatus(currentStreamAccountId());
        lastStatus = status;
        syncLiveClock(status);
        syncCurrentAccountLiveStep(status);
        const bar = ensureBar();
        const isLive = status?.state === 'live' || status?.state === 'starting' || status?.state === 'stopping';
        bar.style.display = isLive ? 'block' : 'none';
        if (isLive) {
          const label = status.state === 'live' ? 'กำลังไลฟ์' : status.state === 'stopping' ? 'หยุดไลฟ์แล้ว' : 'กำลังเริ่มไลฟ์';
          bar.querySelector('[data-state]').textContent = label;
          bar.querySelector('[data-detail]').textContent = status.message || 'สถานะจริงจากระบบ';
          patchVisibleStatusText(status);
        }
      } catch {}
    }
    window.setInterval(poll, 2000);
    window.setInterval(() => syncLiveClock(lastStatus), 1000);
    window.setTimeout(poll, 500);
    window.setTimeout(poll, 1800);
  }

  window.addEventListener('DOMContentLoaded', () => {
    addStyle();
    installBlankScreenRecovery();
    startPatchLoop();
    window.setInterval(pollLiveChatViewer, 2000);
    window.setTimeout(pollLiveChatViewer, 800);
    window.setTimeout(pollLiveChatViewer, 2600);
    const waitForApp = window.setInterval(() => {
      if (!document.querySelector('.app-shell')) return;
      window.clearInterval(waitForApp);
      safeTick();
    }, 500);
  });
})();
