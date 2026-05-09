// ─────────────────────────────────────────
// STATE
// ─────────────────────────────────────────
let filesData = [], globalResults = [];
let processingStats = {total:0,done:0,active:0,error:0};
let isProcessing=false, isPaused=false, isStopped=false;
let currentBatchIndex=0, logHistory=[];
const MAX_LOGS = 1000;

// CSV template state
let csvColumns = null;   // string[]
let csvSamples = null;   // object[]
let tplMode    = 'json'; // 'json' | 'csv'
let currentProvider = 'pollinations';

// Persistent-key storage keys per provider
const KEY_STORE = {
  openrouter:'fv8_key_openrouter',
  groq:      'fv8_key_groq',
  gemini:    'fv8_key_gemini',
  huggingface:'fv8_key_huggingface',
  mistral:   'fv8_key_mistral',
  together:  'fv8_key_together',
};
const CFG_STORE  = 'fv8_cfg';
const LOG_STORE  = 'fv8_logs';

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  loadPersistedKeys();
  loadLogHistory();
  updateProviderUI();
  if('Notification' in window && Notification.permission==='default') Notification.requestPermission();
  log('Famelo v8 جاهز — نظام المعالجة الاحترافي','success');
});

// ─────────────────────────────────────────
// CONFIG PERSISTENCE
// ─────────────────────────────────────────
function saveConfig() {
  const cfg = {};
  // Non-key fields
  ['cfg_pol_model','cfg_pol_seed','cfg_or_model','cfg_groq_model',
   'cfg_gem_model','cfg_mistral_model','cfg_hf_model','cfg_tog_model','cfg_lang','cfg_prompt',
   'cfg_json','cfg_path','cfg_naming','cfg_pattern','cfg_concurrent',
   'cfg_retries','cfg_bgMode','cfg_outRule'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    cfg[id] = el.type==='checkbox' ? el.checked : el.value;
  });
  cfg._provider = currentProvider;
  try { localStorage.setItem(CFG_STORE, JSON.stringify(cfg)); } catch(e){}
  updateProviderUI();
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(CFG_STORE);
    if (!raw) return;
    const cfg = JSON.parse(raw);
    Object.keys(cfg).forEach(id => {
      if (id.startsWith('_')) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type==='checkbox') el.checked = cfg[id];
      else el.value = cfg[id];
    });
    if (cfg._provider) { currentProvider=cfg._provider; selectProvider(currentProvider,true); }
  } catch(e){}
  toggleNaming();
}

// ─────────────────────────────────────────
// PER-PROVIDER KEY PERSISTENCE
// ─────────────────────────────────────────
const KEY_FIELDS = {
  openrouter:'cfg_or_key', groq:'cfg_groq_key',
  gemini:'cfg_gem_key', mistral:'cfg_mistral_key', huggingface:'cfg_hf_key', together:'cfg_tog_key',
};

function saveKey(provider, fieldId) {
  const val = document.getElementById(fieldId)?.value?.trim() || '';
  const storageKey = KEY_STORE[provider];
  if (!storageKey) return;
  try {
    if (val) { localStorage.setItem(storageKey, val); }
    else { localStorage.removeItem(storageKey); }
  } catch(e){}
  // Show saved indicator
  const kw = document.getElementById('kw_'+provider);
  if (kw) kw.classList.toggle('saved', !!val);
  saveConfig();
}

function loadPersistedKeys() {
  Object.entries(KEY_STORE).forEach(([prov, storageKey]) => {
    const val = localStorage.getItem(storageKey);
    if (!val) return;
    const fieldId = KEY_FIELDS[prov];
    const el = fieldId && document.getElementById(fieldId);
    if (el) {
      el.value = val;
      const kw = document.getElementById('kw_'+prov);
      if (kw) kw.classList.add('saved');
    }
  });
}

function getKey(provider) {
  const fieldId = KEY_FIELDS[provider];
  const fromEl = fieldId && document.getElementById(fieldId)?.value?.trim();
  if (fromEl) return fromEl;
  return localStorage.getItem(KEY_STORE[provider]) || '';
}

function toggleEye(fieldId, btn) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  const isHidden = el.type==='password';
  el.type = isHidden ? 'text' : 'password';
  btn.innerHTML = isHidden ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
}

// ─────────────────────────────────────────
// PROVIDER UI
// ─────────────────────────────────────────
const PROVIDER_NAMES = {
  pollinations:'🌸 Pollinations (مجاني)',
  openrouter:'🔀 OpenRouter',
  groq:'⚡ Groq',
  gemini:'✨ Gemini',
  mistral: '🍃 Mistral',
  huggingface:'🤗 HuggingFace',
  together:'🤝 Together AI',
};

function selectProvider(p, silent=false) {
  currentProvider = p;
  // Update buttons
  document.querySelectorAll('.prov-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.prov===p);
  });
  // Update panels
  document.querySelectorAll('.prov-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id==='panel_'+p);
  });
  if (!silent) saveConfig();
  updateProviderUI();
}

function updateProviderUI() {
  const pill = document.getElementById('provPill');
  document.getElementById('provPillText').textContent = PROVIDER_NAMES[currentProvider] || currentProvider;
  pill.classList.toggle('active', isProcessing);
}

function toggleNaming() {
  const mode = document.getElementById('cfg_naming').value;
  document.getElementById('namingPatternWrap').style.display = mode==='pattern' ? 'block' : 'none';
}

// ─────────────────────────────────────────
// TEMPLATE MODE (JSON / CSV)
// ─────────────────────────────────────────
function switchTplMode(mode) {
  tplMode = mode;
  document.getElementById('tab_json').classList.toggle('active', mode==='json');
  document.getElementById('tab_csv').classList.toggle('active', mode==='csv');
  document.getElementById('tpl_json_wrap').style.display = mode==='json' ? 'block' : 'none';
  document.getElementById('tpl_csv_wrap').style.display = mode==='csv' ? 'block' : 'none';
}

function handleCsvTemplate(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => parseCsvTemplate(ev.target.result, file.name);
  reader.readAsText(file, 'UTF-8');
}

// Allow drag-drop on csv zone
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const zone = document.getElementById('csvDrop');
    if (!zone) return;
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor='var(--cyan)'; });
    zone.addEventListener('dragleave', () => zone.style.borderColor='');
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.style.borderColor='';
      const f = e.dataTransfer.files[0];
      if (f) { const r=new FileReader(); r.onload=ev=>parseCsvTemplate(ev.target.result,f.name); r.readAsText(f,'UTF-8'); }
    });
  });
})();

function parseCsvTemplate(text, fileName) {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/,'');
  const lines = clean.split(/\r?\n/).filter(l=>l.trim());
  if (!lines.length) { showNotification('خطأ','ملف CSV فارغ','error'); return; }

  // CSV parser (handles quoted commas)
  function parseRow(line) {
    const r=[]; let cur=''; let inQ=false;
    for(let i=0;i<line.length;i++){
      const c=line[i];
      if(c==='"'){ inQ=!inQ; } else if(c===','&&!inQ){ r.push(cur.trim()); cur=''; } else cur+=c;
    }
    r.push(cur.trim()); return r;
  }

  const headers = parseRow(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim());
  csvColumns = headers;
  csvSamples = [];
  for(let i=1;i<Math.min(lines.length,5);i++){
    const vals = parseRow(lines[i]);
    const obj={}; headers.forEach((h,idx)=>{ obj[h]=(vals[idx]||'').replace(/^"|"$/g,'').trim(); });
    csvSamples.push(obj);
  }

  // UI feedback
  const zone = document.getElementById('csvDrop');
  zone.classList.add('loaded');
  document.getElementById('csvDropLabel').textContent = `✓ ${fileName} (${headers.length} عمود)`;

  document.getElementById('csvColsWrap').style.display='block';
  document.getElementById('csvColTags').innerHTML = headers.map(h=>`<span class="csv-col-tag">${h}</span>`).join('');

  const sampleBox = document.getElementById('csvSampleBox');
  if(csvSamples[0]){
    const sampleObj={}; headers.forEach(h=>{ sampleObj[h]=csvSamples[0][h]||`قيمة ${h}`; });
    sampleBox.textContent = JSON.stringify(sampleObj,null,2);
    sampleBox.classList.add('show');
  }

  log(`قالب CSV: ${headers.length} عمود من "${fileName}"`, 'success');
  showNotification('تم تحميل القالب',`${headers.length} عمود: ${headers.slice(0,3).join(', ')}...`,'success');
}

function buildStructureForAI() {
  if (tplMode==='csv' && csvColumns) {
    const obj={};
    csvColumns.forEach(col => { obj[col]=csvSamples?.[0]?.[col]||`قيمة ${col}`; });
    return JSON.stringify(obj,null,2);
  }
  return document.getElementById('cfg_json').value;
}

// ─────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────
function showNotification(title, msg, type='success') {
  const icons={success:'fa-check-circle',error:'fa-exclamation-circle',warning:'fa-exclamation-triangle',info:'fa-info-circle'};
  const div=document.createElement('div');
  div.className=`notif ${type}`;
  div.innerHTML=`<i class="fas ${icons[type]||icons.info}"></i><div class="notif-content"><div class="notif-title">${title}</div><div class="notif-msg">${msg}</div></div><button class="notif-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>`;
  document.getElementById('notifContainer').appendChild(div);
  setTimeout(()=>{ div.style.opacity='0'; div.style.transform='translateX(-110%)'; div.style.transition='all .3s'; setTimeout(()=>div.remove(),350); },5000);
  if(type==='success'||type==='error') beep(type);
}

function beep(type) {
  try{
    const ac=new(window.AudioContext||window.webkitAudioContext)();
    const o=ac.createOscillator(),g=ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.frequency.value=type==='success'?880:380; o.type='sine';
    g.gain.setValueAtTime(.2,ac.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.35);
    o.start(); o.stop(ac.currentTime+.35);
  }catch(e){}
}

// ─────────────────────────────────────────
// LOGGING
// ─────────────────────────────────────────
function log(msg,type='info'){
  const area=document.getElementById('log-area');
  const ts=new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const icons={success:'✓',error:'✗',info:'·',sys:'⚙',warning:'!'};
  const row=document.createElement('div');
  row.className=`log-row log-${type}`;
  row.innerHTML=`<span class="log-ts">[${ts}]</span><span class="log-ic">${icons[type]||'·'}</span><span class="log-msg">${msg}</span>`;
  area.appendChild(row); area.scrollTop=area.scrollHeight;
  logHistory.push({ts:new Date().toISOString(),type,msg});
  if(logHistory.length>MAX_LOGS) logHistory=logHistory.slice(-MAX_LOGS);
  try{localStorage.setItem(LOG_STORE,JSON.stringify(logHistory));}catch(e){}
}

function loadLogHistory(){
  try{
    const raw=localStorage.getItem(LOG_STORE);
    if(!raw) return;
    logHistory=JSON.parse(raw);
    const area=document.getElementById('log-area');
    const icons={success:'✓',error:'✗',info:'·',sys:'⚙',warning:'!'};
    logHistory.slice(-20).forEach(entry=>{
      const ts=new Date(entry.ts).toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
      const row=document.createElement('div');
      row.className=`log-row log-${entry.type}`;
      row.innerHTML=`<span class="log-ts">[${ts}]</span><span class="log-ic">${icons[entry.type]||'·'}</span><span class="log-msg">${entry.msg}</span>`;
      area.appendChild(row);
    });
    area.scrollTop=area.scrollHeight;
  }catch(e){}
}

function clearLogs(){
  if(confirm('مسح جميع السجلات؟')){ document.getElementById('log-area').innerHTML=''; logHistory=[]; localStorage.removeItem(LOG_STORE); log('تم مسح السجلات','info'); }
}

function exportLogs(){
  if(!logHistory.length){showNotification('لا سجلات','','warning');return;}
  let txt=`=== Famelo v8 Logs — ${new Date().toLocaleString('ar-SA')} ===\n\n`;
  logHistory.forEach(e=>{txt+=`[${new Date(e.ts).toLocaleString()}] [${e.type.toUpperCase()}] ${e.msg}\n`;});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
  a.download=`famelo_logs_${new Date().toISOString().split('T')[0]}.txt`; a.click();
}

// ─────────────────────────────────────────
// FILE HANDLING
// ─────────────────────────────────────────
function handleDragOver(e){e.preventDefault();e.currentTarget.classList.add('dragover');}
function handleDragLeave(e){e.currentTarget.classList.remove('dragover');}
function handleDrop(e){
  e.preventDefault();e.currentTarget.classList.remove('dragover');
  const files=Array.from(e.dataTransfer.files).filter(f=>f.type.startsWith('image/'));
  loadFiles(files);
}
function handleFileSelect(e){
  const files=Array.from(e.target.files).filter(f=>f.type.startsWith('image/')); loadFiles(files);
}

function loadFiles(files){
  if(!files.length){showNotification('لا توجد صور','اختر ملفات صور صالحة','warning');return;}
  if(files.length>100){showNotification('تحذير','تم تحميل أول 100 صورة','warning');files=files.slice(0,100);}
  filesData=files.map((f,i)=>({id:Date.now()+i,file:f,status:'pending',progress:0,result:null,error:null}));
  renderGrid(); updateStats();
  log(`تم تحميل ${files.length} صورة`,'success');
  showNotification('تم التحميل',`${files.length} صورة جاهزة`,'success');
  document.getElementById('btnStart').disabled=false;
  isPaused=false; isStopped=false; currentBatchIndex=0;
  document.getElementById('exportPanel').classList.remove('show');
}

function renderGrid(){
  const grid=document.getElementById('imageGrid');
  grid.innerHTML='';
  filesData.forEach(item=>{
    const card=document.createElement('div');
    card.className=`img-card ${item.status}`;
    card.onclick=()=>item.result&&showDetails(item.id);
    const img=document.createElement('img');
    img.src=URL.createObjectURL(item.file);
    card.appendChild(img);
    const ov=document.createElement('div');
    ov.className='card-overlay'; ov.id=`ov_${item.id}`;
    ov.innerHTML=`<svg width="54" height="54" class="ring"><circle cx="27" cy="27" r="22" stroke="#1c2133" stroke-width="3.5" fill="none"/><circle cx="27" cy="27" r="22" stroke="#5b4af8" stroke-width="3.5" fill="none" class="ring-circle" id="rc_${item.id}" stroke-dasharray="138" stroke-dashoffset="138"/></svg><div class="pct-txt" id="pct_${item.id}">0%</div><div class="card-status-badge" id="badge_${item.id}">انتظار</div><div class="card-sub" id="sub_${item.id}"></div>`;
    card.appendChild(ov);
    grid.appendChild(card);
  });
}

function updateStats(){
  processingStats={
    total:filesData.length,
    done:filesData.filter(f=>f.status==='done').length,
    active:filesData.filter(f=>f.status==='processing').length,
    error:filesData.filter(f=>f.status==='error').length,
  };
  ['total','done','active','error'].forEach(k=>document.getElementById(`stat_${k}`).textContent=processingStats[k]);
  const pct=processingStats.total>0?Math.round(processingStats.done/processingStats.total*100):0;
  document.getElementById('progressBar').style.width=pct+'%';
  document.getElementById('progressPct').textContent=pct+'%';
  let lbl='في انتظار البدء...';
  if(isPaused) lbl='متوقف مؤقتاً';
  else if(isStopped) lbl='تم الإيقاف';
  else if(processingStats.active>0) lbl=`جاري معالجة ${processingStats.active}/${processingStats.total}`;
  else if(processingStats.done===processingStats.total&&processingStats.total>0) lbl='اكتمل ✓';
  document.getElementById('progressLabel').textContent=lbl;
}

function setCardProgress(id,pct,badge,sub=''){
  const ov=document.getElementById(`ov_${id}`);
  if(ov) ov.style.display='flex';
  const rc=document.getElementById(`rc_${id}`);
  if(rc) rc.style.strokeDashoffset=138-(pct/100)*138;
  const p=document.getElementById(`pct_${id}`); if(p) p.textContent=Math.round(pct)+'%';
  const b=document.getElementById(`badge_${id}`); if(b) b.textContent=badge;
  const s=document.getElementById(`sub_${id}`); if(s) s.textContent=sub;
}
function hideCardOverlay(id){const ov=document.getElementById(`ov_${id}`);if(ov)ov.style.display='none';}

// ─────────────────────────────────────────
// PROCESS CONTROL
// ─────────────────────────────────────────
async function startWorkflow(){
  if(!filesData.length){showNotification('لا توجد صور','رفع الصور أولاً','warning');return;}
  isPaused=false; isStopped=false; currentBatchIndex=0; globalResults=[];
  filesData.forEach(item=>{if(item.status!=='done'){item.status='pending';item.progress=0;item.error=null;hideCardOverlay(item.id);}});
  renderGrid();
  isProcessing=true;
  document.getElementById('btnStart').disabled=true;
  document.getElementById('statusTitle').textContent='جاري المعالجة...';
  document.getElementById('curTask').style.display='flex';
  document.getElementById('ctrlBtns').style.display='flex';
  document.getElementById('btnPause').innerHTML='<i class="fas fa-pause"></i> إيقاف مؤقت';
  document.getElementById('btnPause').className='btn btn-warning btn-sm';
  document.getElementById('exportPanel').classList.remove('show');
  updateProviderUI();
  log('بدء المعالجة — المزود: '+PROVIDER_NAMES[currentProvider],'sys');
  if(document.getElementById('cfg_bgMode').checked) showNotification('خلفية','ستتلقى إشعاراً عند الانتهاء','info');
  try{
    await processAll();
    if(!isStopped){showNotification('اكتمل!',`${processingStats.done}/${processingStats.total} صورة`,'success');finishWorkflow();}
  }catch(err){
    if(!isStopped){showNotification('خطأ',err.message,'error');log('فشل: '+err.message,'error');}
  }finally{
    if(!isStopped){document.getElementById('curTask').style.display='none';document.getElementById('ctrlBtns').style.display='none';isProcessing=false;updateProviderUI();}
  }
}

async function processAll(){
  const batchSize=parseInt(document.getElementById('cfg_concurrent').value);
  for(let i=0;i<filesData.length;i+=batchSize){
    if(isStopped) break;
    while(isPaused&&!isStopped) await sleep(500);
    if(isStopped) break;
    currentBatchIndex=i;
    const batch=filesData.slice(i,i+batchSize).filter(f=>f.status!=='done');
    if(batch.length) await processBatch(batch);
  }
}

async function processBatch(batch){
  // Process individual files in the batch concurrently
  await Promise.all(batch.map(item => processFile(item)));
}

async function processFile(item){
  const retries = parseInt(document.getElementById('cfg_retries').value) || 0;
  let attempts = 0;

  while(attempts <= retries) {
    if(isStopped) return;
    while(isPaused && !isStopped) await sleep(500);
    if(isStopped) return;

    try {
      item.status = 'processing'; updateStats(); renderGrid();
      setCardProgress(item.id, 5, 'قراءة', 'تحميل...');
      const b64 = await readAsBase64(item.file, p=>setCardProgress(item.id, 5+p*0.1, 'قراءة', Math.round(p)+'%'));
      if(isStopped) return;

      setCardProgress(item.id, 30, 'تحليل', 'إرسال للـ AI...');
      document.getElementById('curTaskText').textContent=`تحليل: ${item.file.name}`;

      const modelMap = {
        pollinations: 'cfg_pol_model',
        openrouter: 'cfg_or_model',
        gemini: 'cfg_gem_model',
        groq: 'cfg_groq_model',
        mistral: 'cfg_mistral_model',
        huggingface: 'cfg_hf_model',
        together: 'cfg_tog_model'
      };

      const payload = {
        provider: currentProvider,
        model: document.getElementById(modelMap[currentProvider])?.value,
        apiKey: getKey(currentProvider),
        prompt: buildPrompt(),
        structure: buildStructureForAI(),
        image: b64,
        id: item.id
      };

      if(currentProvider==='pollinations') payload.seed = document.getElementById('cfg_pol_seed').value;

      const response = await fetch('api/v2/process.php', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {'Content-Type': 'application/json'}
      });

      if(!response.ok) {
        const errTxt = await response.text();
        throw new Error(errTxt || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if(data.error) throw new Error(data.error);

      const finalData = buildFinalData(item.file, data.result, filesData.indexOf(item));
      item.result = finalData; item.status = 'done';
      globalResults.push(finalData);
      setCardProgress(item.id, 100, 'اكتمل', '✓');
      setTimeout(()=>hideCardOverlay(item.id), 800);
      log(`✓ ${item.file.name}`, 'success');
      updateStats(); renderGrid();
      return;

    } catch(err) {
      attempts++;
      if(isStopped) return;
      if(attempts <= retries) {
        log(`⚠ محاولة ${attempts}/${retries} — ${item.file.name}: ${err.message}`, 'warning');
        setCardProgress(item.id, 50, 'إعادة', `محاولة ${attempts+1}...`);
        await sleep(2000);
      } else {
        item.status = 'error'; item.error = err.message;
        setCardProgress(item.id, 100, 'فشل', err.message.slice(0, 30));
        log(`✗ ${item.file.name}: ${err.message}`, 'error');
        updateStats(); renderGrid();
      }
    }
  }
}


function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

function readAsBase64(file,onProg){
  return new Promise((res,rej)=>{
    const reader=new FileReader();
    reader.onprogress=e=>{if(e.lengthComputable)onProg(e.loaded/e.total*100);};
    reader.onload=()=>res(reader.result); reader.onerror=rej;
    reader.readAsDataURL(file);
  });
}

function buildFinalData(file,aiJson,idx){
  const mode=document.getElementById('cfg_naming').value;
  const ext=file.name.split('.').pop();
  const pattern=document.getElementById('cfg_pattern').value;
  const name=mode==='pattern'?pattern.replace('{i}',idx+1)+'.'+ext:file.name;
  const path=document.getElementById('cfg_path').value;
  return{...aiJson,اسم_الصورة:name,المسار_الكامل:path+name};
}

function pauseProcessing(){
  if(!isProcessing) return;
  isPaused=!isPaused;
  const btn=document.getElementById('btnPause');
  if(isPaused){
    btn.innerHTML='<i class="fas fa-play"></i> استئناف'; btn.className='btn btn-success btn-sm';
    log('توقف مؤقت','warning'); showNotification('توقف مؤقت','','warning');
    document.getElementById('statusTitle').textContent='متوقف مؤقتاً';
  }else{
    btn.innerHTML='<i class="fas fa-pause"></i> إيقاف مؤقت'; btn.className='btn btn-warning btn-sm';
    log('استئناف المعالجة','info'); showNotification('استئناف','','info');
    document.getElementById('statusTitle').textContent='جاري المعالجة...';
  }
  updateStats();
}

function stopProcessing(){
  if(!isProcessing) return;
  if(!confirm('إيقاف المعالجة نهائياً؟')) return;
  isStopped=true; isPaused=false; isProcessing=false;
  log('تم الإيقاف','error');
  document.getElementById('statusTitle').textContent='تم الإيقاف';
  document.getElementById('curTask').style.display='none';
  document.getElementById('ctrlBtns').style.display='none';
  document.getElementById('btnStart').disabled=false;
  document.getElementById('btnStart').innerHTML='<i class="fas fa-redo"></i> بدء جديد';
  updateProviderUI(); updateStats();
  filesData.forEach(item=>{if(['processing','pending'].includes(item.status)){item.status='error';item.error='أُوقف';hideCardOverlay(item.id);}});
  renderGrid();
}

function finishWorkflow(){
  isProcessing=false; isPaused=false;
  log('اكتملت جميع العمليات!','success');
  document.getElementById('statusTitle').textContent='اكتمل!';
  document.getElementById('ctrlBtns').style.display='none';
  const rule=document.getElementById('cfg_outRule').value;
  document.getElementById('final_name').value=rule.replace('{date}',new Date().toISOString().split('T')[0]);
  document.getElementById('exportPanel').classList.add('show');
  document.getElementById('btnStart').disabled=false;
  document.getElementById('btnStart').innerHTML='<i class="fas fa-redo"></i> معالجة جديدة';
  document.getElementById('exportPanel').scrollIntoView({behavior:'smooth',block:'nearest'});
  updateProviderUI();
}

// ─────────────────────────────────────────
// AI PROVIDERS
// ─────────────────────────────────────────
function buildPrompt(){
  const base=document.getElementById('cfg_prompt').value;
  const lang=document.getElementById('cfg_lang').value;
  const lmap={ar:'أجب باللغة العربية فقط.',en:'Answer in English only.',both:'أجب بالعربية والإنجليزية.'};
  return `${base}\n\n${lmap[lang]||''}`;
}

function extractJSON(text){
  if(!text) throw new Error('AI لم يرد بنص');
  // Try ```json block first
  const m1=text.match(/```json\s*([\s\S]*?)```/);
  const m2=text.match(/```\s*([\s\S]*?)```/);
  const jsonStr=(m1?m1[1]:m2?m2[1]:text).trim();
  // Find outermost {} or []
  const first=jsonStr.search(/[{[]/);
  if(first===-1) throw new Error('لم يتم العثور على JSON صالح');
  const partial=jsonStr.slice(first);
  const last=Math.max(partial.lastIndexOf('}'),partial.lastIndexOf(']'));
  if(last===-1) throw new Error('هيكل JSON غير مكتمل');
  try{ return JSON.parse(partial.slice(0,last+1)); }
  catch(e){ throw new Error('فشل تحليل JSON: '+e.message); }
}

async function callAI(b64,onProgress){
  switch(currentProvider){
    case 'pollinations': return await callPollinations(b64,onProgress);
    case 'openrouter':   return await callOpenRouter(b64,onProgress);
    case 'gemini':       return await callGemini(b64,onProgress);
    case 'groq':         return await callGroq(b64,onProgress);
    case 'huggingface':  return await callHuggingFace(b64,onProgress);
    case 'together':     return await callTogether(b64,onProgress);
    default: throw new Error('مزود غير معروف: '+currentProvider);
  }
}

async function testConnection(){
  log(`اختبار الاتصال — ${PROVIDER_NAMES[currentProvider]}...`,'sys');
  try{
    const c=document.createElement('canvas'); c.width=8;c.height=8;
    const ctx=c.getContext('2d'); ctx.fillStyle='#ccc'; ctx.fillRect(0,0,8,8);
    const b64 = c.toDataURL('image/png');

    const modelMap = {
      pollinations: 'cfg_pol_model',
      openrouter: 'cfg_or_model',
      gemini: 'cfg_gem_model',
      groq: 'cfg_groq_model',
      mistral: 'cfg_mistral_model',
      huggingface: 'cfg_hf_model',
      together: 'cfg_tog_model'
    };

    const payload = {
      provider: currentProvider,
      model: document.getElementById(modelMap[currentProvider])?.value,
      apiKey: getKey(currentProvider),
      prompt: 'Test connection. Return {"status":"ok"}',
      structure: '{"status":"string"}',
      image: b64,
      id: 'test'
    };

    const response = await fetch('api/v2/process.php', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {'Content-Type': 'application/json'}
    });

    if(!response.ok) throw new Error(`HTTP ${response.status}`);

    showNotification('نجح الاتصال',`${PROVIDER_NAMES[currentProvider]} يعمل ✓`,'success');
    log('نجح الاتصال','success');
  }catch(e){
    showNotification('فشل الاتصال',e.message,'error');
    log('فشل: '+e.message,'error');
  }
}

// ─────────────────────────────────────────
// RESULTS & EXPORT
// ─────────────────────────────────────────
function showDetails(id){
  const item=filesData.find(f=>f.id===id);
  if(!item?.result) return;
  let html=`<div style="text-align:center;padding:16px;background:var(--card2);border-radius:10px;margin-bottom:20px;"><img src="${URL.createObjectURL(item.file)}" style="max-height:220px;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.5);"><div style="margin-top:10px;font-weight:700;font-size:.9rem;">${item.file.name}</div></div><table style="width:100%;border-collapse:collapse;">`;
  for(const[k,v] of Object.entries(item.result)){
    html+=`<tr style="border-bottom:1px solid var(--border);"><td style="padding:12px 14px;font-weight:600;color:var(--text2);font-size:.78rem;width:35%;">${k}</td><td style="padding:12px 14px;"><div style="display:flex;align-items:center;gap:10px;justify-content:space-between;"><span style="word-break:break-word;flex:1;font-size:.82rem;">${v}</span><button onclick="copyVal('${String(v).replace(/'/g,"\\'")}',this)" style="background:var(--card3);border:1px solid var(--border);color:var(--text2);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:.68rem;white-space:nowrap;font-family:inherit;font-weight:600;"><i class="fas fa-copy"></i> نسخ</button></div></td></tr>`;
  }
  html+='</table>';
  document.getElementById('modalBody').innerHTML=html;
  document.getElementById('modal').style.display='flex';
}

function copyVal(text,btn){
  navigator.clipboard.writeText(text).then(()=>{
    const orig=btn.innerHTML; btn.innerHTML='<i class="fas fa-check"></i> تم!';
    btn.style.background='var(--green)'; btn.style.color='#000';
    setTimeout(()=>{btn.innerHTML=orig;btn.style.background='';btn.style.color='';},1800);
  });
}

function generateAndDownload(){
  if(!globalResults.length){showNotification('لا توجد نتائج','','warning');return;}
  const type=document.getElementById('final_type').value;
  const name=document.getElementById('final_name').value;
  try{
    if(type==='xlsx'){
      const ws=XLSX.utils.json_to_sheet(globalResults);
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Famelo_Data');
      XLSX.writeFile(wb,`${name}.xlsx`);
    }else if(type==='csv'){
      const keys=Object.keys(globalResults[0]);
      let csv='\uFEFF'+keys.join(',')+'\n';
      globalResults.forEach(row=>{csv+=keys.map(k=>`"${String(row[k]||'').replace(/"/g,'""')}"`).join(',')+'\n';});
      dlBlob(csv,'text/csv',`${name}.csv`);
    }else{
      dlBlob(JSON.stringify(globalResults,null,2),'application/json',`${name}.json`);
    }
    log(`تم تحميل: ${name}.${type}`,'success');
    showNotification('تم التصدير',`${name}.${type}`,'success');
  }catch(e){showNotification('خطأ في التصدير',e.message,'error');}
}

function dlBlob(content,mime,filename){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=filename; a.click(); URL.revokeObjectURL(a.href);
}

// ─────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────
function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.querySelector('.overlay-bg').classList.toggle('open');
}