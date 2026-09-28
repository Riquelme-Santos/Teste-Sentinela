(function(){
  const path=location.pathname.split('/').pop()||'index.html';
  const pages={
    'atendimento.html':['Atendimento','Novo atendimento','🧾'],
    'triagem.html':['Triagem','Avaliação de pacientes','🩺'],
    'medico.html':['Painel médico','Gestão clínica','👨‍⚕️'],
    'medicacoes.html':['Medicações','Prescrições','💊'],
    'tv.html':['Painel TV','Chamadas','📺'],
    'internacao.html':['Internação','Pacientes internados','🛏️']
  };

  const protectedPages = new Set(['atendimento.html','triagem.html','medico.html','medicacoes.html','internacao.html']);
  const token = sessionStorage.getItem('medflow_token');
  if(protectedPages.has(path) && !token){ location.replace('index.html'); return; }

  // Camada única de API: injeta o token em todas as chamadas autenticadas.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init){
    const url = typeof input === 'string' ? input : input?.url || '';
    const isLogin = url.includes('/login');
    const headers = new Headers(init?.headers || (typeof input !== 'string' ? input.headers : undefined));
    const currentToken = sessionStorage.getItem('medflow_token');
    if(currentToken && !isLogin && url.startsWith('/')) headers.set('Authorization', `Bearer ${currentToken}`);
    const nextInit = {...(init || {}), headers};
    const response = await nativeFetch(input, nextInit);
    if(response.status === 401 && !isLogin){
      sessionStorage.removeItem('medflow_token');
      sessionStorage.removeItem('medflow_tipo');
      sessionStorage.removeItem('medflow_usuario');
      if(location.pathname.split('/').pop() !== 'index.html') location.replace('index.html');
    }
    return response;
  };

  if(path==='index.html'||path===''){document.body.classList.add('mf-login');return;}
  if(path==='tv.html') document.body.classList.add('mf-tv');
  document.body.classList.add('mf-app');
  const active=pages[path]||pages['medico.html'];
  const nav=[['index.html','⌂','Início'],['atendimento.html','＋','Atendimento'],['triagem.html','🩺','Triagem'],['medico.html','▣','Painel médico'],['medicacoes.html','💊','Medicações'],['tv.html','📺','Painel TV'],['internacao.html','🛏️','Internação']];
  const side=document.createElement('aside');side.className='mf-sidebar';
  side.innerHTML=`<div class="mf-logo"><div class="mf-mark"></div><div class="mf-brand-text"><div class="mf-brand-name">MedFlow</div><div class="mf-brand-sub">Hospital Operations</div></div></div><div class="mf-nav-label">Navegação</div><nav class="mf-nav">${nav.map(n=>`<a href="${n[0]}" class="${path===n[0]?'active':''}"><span class="mf-icon">${n[1]}</span><span>${n[2]}</span></a>`).join('')}</nav><div class="mf-side-footer"><div class="mf-status"><i class="mf-dot"></i> Sistema operacional</div>Ambiente hospitalar</div>`;
  document.body.prepend(side);
  const main=document.createElement('div');main.className='mf-main';
  const user=sessionStorage.getItem('medflow_usuario')||'Equipe MedFlow';
  const top=document.createElement('div');top.className='mf-topbar';top.innerHTML=`<div class="mf-breadcrumb"><strong>${active[0]}</strong><br>${active[1]}</div><div class="mf-user"><div><strong style="font-size:12px">${user}</strong><br><span>Ambiente interno</span></div><div class="mf-avatar">MF</div></div>`;
  document.body.appendChild(main);main.appendChild(top);
  while(document.body.children.length>2) { const el=document.body.children[2]; if(el===side||el===main) break; main.appendChild(el); }
  const original=[...document.body.children].filter(x=>x!==side&&x!==main);
  original.forEach(x=>main.appendChild(x));
})();
