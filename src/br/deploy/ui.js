// DeploymentUI — military-ops style HUD for the INKFORGE preparation, boarding and deployment sequence.

const CSS = `
.ifx{position:fixed;inset:0;pointer-events:none;z-index:20;color:#e9f6fb;font-family:"Rajdhani","Bahnschrift","Arial Narrow",system-ui,sans-serif;text-transform:uppercase;user-select:none;--cy:#20d8e9;--co:#ff7652;--am:#ffb42e;--mg:#ff3fa4;--lm:#9cff4f}
.ifx *{box-sizing:border-box}
.ifx-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(3,10,16,.55) 100%)}
.ifx-lb{position:absolute;left:0;right:0;height:0;background:#02060a;transition:height .8s ease}
.ifx-lb.t{top:0}.ifx-lb.b{bottom:0}
.ifx.cine .ifx-lb{height:6.5vh}
.ifx-top{position:absolute;top:0;left:0;right:0;height:46px;display:flex;justify-content:space-between;align-items:center;padding:0 18px;background:linear-gradient(180deg,rgba(2,10,16,.85),rgba(2,10,16,0));font-weight:700;letter-spacing:.22em;font-size:13px}
.ifx.cine .ifx-top{top:6.5vh}
.ifx-brand b{color:var(--cy)}.ifx-brand span{opacity:.55;font-weight:500;margin-left:10px}
.ifx-clock{color:var(--am);font-variant-numeric:tabular-nums}
.ifx-center{position:absolute;top:13vh;left:0;right:0;text-align:center;padding:0 12px}
.ifx-kicker{font-size:clamp(10px,1.2vw,14px);letter-spacing:.5em;color:var(--cy);opacity:.9}
.ifx-title{margin:4px 0 0;font-weight:700;font-size:clamp(22px,4.8vw,66px);letter-spacing:.12em;text-shadow:0 0 24px rgba(32,216,233,.55),0 2px 0 rgba(0,0,0,.6);line-height:1.05}
.ifx-sub{margin-top:6px;font-size:clamp(11px,1.6vw,20px);letter-spacing:.34em;color:var(--co);text-shadow:0 0 12px rgba(255,118,82,.5)}
.ifx-haz{width:min(520px,60vw);height:7px;margin:12px auto 0;background:repeating-linear-gradient(-45deg,var(--am) 0 12px,#0b1118 12px 24px);opacity:.85;clip-path:polygon(0 0,100% 0,calc(100% - 7px) 100%,7px 100%)}
.ifx-swap .ifx-title,.ifx-swap .ifx-sub{animation:ifxGlitch .55s steps(2,end)}
@keyframes ifxGlitch{0%{opacity:0;transform:translateX(-14px) skewX(-8deg);filter:blur(3px)}30%{opacity:1;transform:translateX(9px)}55%{transform:translateX(-4px);text-shadow:3px 0 var(--mg),-3px 0 var(--cy)}100%{transform:none}}
.ifx-count{position:absolute;top:64px;right:18px;min-width:150px;padding:8px 14px;border:1px solid rgba(255,118,82,.7);background:rgba(8,16,24,.62);backdrop-filter:blur(4px);clip-path:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%)}
.ifx.cine .ifx-count{top:calc(6.5vh + 52px)}
.ifx-count .l{font-size:11px;letter-spacing:.3em;color:var(--co)}
.ifx-count .v{font-size:40px;font-weight:700;letter-spacing:.06em;font-variant-numeric:tabular-nums;line-height:1.05}
.ifx-count.urgent .v{color:#ff3a3a;animation:ifxBlink .5s steps(2,end) infinite}
@keyframes ifxBlink{50%{opacity:.25}}
.ifx-tele{position:absolute;left:18px;top:50%;transform:translateY(-30%);width:190px;padding:8px 12px;border-left:3px solid var(--cy);background:linear-gradient(90deg,rgba(8,16,24,.7),rgba(8,16,24,0));font-size:13px;letter-spacing:.16em}
.ifx-tele div{display:flex;justify-content:space-between;padding:2px 0}
.ifx-tele .h{color:var(--cy);font-weight:700;margin-bottom:4px}
.ifx-tele span:first-child{opacity:.6}
.ifx-log{position:absolute;left:18px;bottom:72px;width:min(420px,44vw);font:500 12px/1.5 ui-monospace,"Cascadia Mono",Menlo,monospace;letter-spacing:.06em;color:#9fdde6;text-shadow:0 1px 2px #000}
.ifx-log div{opacity:.95;animation:ifxIn .4s ease}
.ifx-log div:nth-last-child(n+4){opacity:.55}.ifx-log div:nth-last-child(n+5){opacity:.3}
@keyframes ifxIn{from{opacity:0;transform:translateX(-12px)}}
.ifx-prog{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:min(760px,86vw)}
.ifx.cine .ifx-prog{bottom:calc(6.5vh + 14px)}
.ifx-prog .bar{height:4px;background:rgba(255,255,255,.14);position:relative}
.ifx-prog .fill{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,var(--cy),var(--co));box-shadow:0 0 12px var(--cy)}
.ifx-prog .pips{display:flex;justify-content:space-between;margin-top:6px;font-size:10px;letter-spacing:.14em;opacity:.8}
.ifx-prog .pips i{font-style:normal;flex:1;text-align:center;opacity:.35;white-space:nowrap;overflow:hidden}
.ifx-prog .pips i.on{opacity:1;color:var(--am)}
.ifx-prog .pips i.done{opacity:.7;color:var(--cy)}
.ifx-banner{position:absolute;left:0;right:0;top:44%;text-align:center;font-size:clamp(26px,6vw,84px);font-weight:700;letter-spacing:.2em;opacity:0;color:#fff;text-shadow:0 0 30px var(--co)}
.ifx-banner.show{animation:ifxBanner 2.6s ease forwards}
@keyframes ifxBanner{0%{opacity:0;transform:scale(1.25)}12%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0;transform:scale(.96)}}
@media (max-width:760px){.ifx-tele,.ifx-log{display:none}.ifx-count{top:52px;right:8px;min-width:110px}.ifx-count .v{font-size:28px}.ifx-prog .pips{display:none}}
`;

const ABBR = { intro: 'WELCOME', prep: 'PREP', approach: 'INBOUND', landing: 'LANDING', landed: 'LANDED', boarding: 'BOARDING', finalCall: 'FINAL', closing: 'SECURE', takeoff: 'LAUNCH', transit: 'TRANSIT', deploy: 'DEPLOY', complete: 'DONE' };

export class DeploymentUI {
  constructor({ container = document.body, phases }) {
    this.phases = phases;
    if (!document.getElementById('ifx-css')) {
      const st = document.createElement('style');
      st.id = 'ifx-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const el = document.createElement('div');
    el.className = 'ifx';
    el.innerHTML = `
      <div class="ifx-vig"></div><div class="ifx-lb t"></div><div class="ifx-lb b"></div>
      <div class="ifx-top"><div class="ifx-brand"><b>INKFORGE</b><span>// TINT3D BATTLE ROYALE OPS</span></div><div class="ifx-clock"></div></div>
      <div class="ifx-center"><div class="ifx-kicker"></div><h1 class="ifx-title"></h1><div class="ifx-sub"></div><div class="ifx-haz"></div></div>
      <div class="ifx-count"><div class="l"></div><div class="v"></div></div>
      <div class="ifx-tele"><div class="h">TRANSPORT TX-01</div><div><span>ALT</span><span data-k="alt"></span></div><div><span>SPD</span><span data-k="speed"></span></div><div><span>DIST</span><span data-k="dist"></span></div><div><span>GEAR</span><span data-k="gear"></span></div><div><span>RAMP</span><span data-k="ramp"></span></div></div>
      <div class="ifx-log"></div>
      <div class="ifx-prog"><div class="bar"><div class="fill"></div></div><div class="pips">${phases.map((p) => `<i data-p="${p.id}">${ABBR[p.id] || p.id}</i>`).join('')}</div></div>
      <div class="ifx-banner"></div>`;
    container.appendChild(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.refs = { kicker: this.q('.ifx-kicker'), title: this.q('.ifx-title'), sub: this.q('.ifx-sub'), clock: this.q('.ifx-clock'), count: this.q('.ifx-count'), cl: this.q('.ifx-count .l'), cv: this.q('.ifx-count .v'), fill: this.q('.fill'), log: this.q('.ifx-log'), banner: this.q('.ifx-banner') };
    this.pips = [...el.querySelectorAll('.pips i')];
    this.last = {};
  }

  setCinematic(on) { this.el.classList.toggle('cine', !!on); }
  log(text) {
    const d = document.createElement('div');
    d.textContent = text;
    this.refs.log.appendChild(d);
    while (this.refs.log.children.length > 6) this.refs.log.firstChild.remove();
  }
  banner(text, color = '#ff7652') {
    const b = this.refs.banner;
    b.textContent = text;
    b.style.textShadow = `0 0 30px ${color}`;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
  }
  update(s) {
    const L = this.last;
    if (L.title !== s.title) {
      L.title = s.title;
      this.refs.title.textContent = s.title;
      this.refs.sub.textContent = s.sub;
      this.refs.kicker.textContent = 'OPERATION LOG // ' + String(s.phase ? this.phases.findIndex((p) => p.id === s.phaseId) + 1 : 1).padStart(2, '0');
      this.el.classList.remove('ifx-swap');
      void this.el.offsetWidth;
      this.el.classList.add('ifx-swap');
      this.pips.forEach((p, i) => {
        const idx = this.phases.findIndex((x) => x.id === s.phaseId);
        p.className = i < idx ? 'done' : i === idx ? 'on' : '';
      });
    }
    if (L.clock !== s.clock) { L.clock = s.clock; this.refs.clock.textContent = s.clock; }
    if (L.count !== s.count || L.cl !== s.countLabel) { L.count = s.count; L.cl = s.countLabel; this.refs.cv.textContent = s.count; this.refs.cl.textContent = s.countLabel; }
    this.refs.count.classList.toggle('urgent', !!s.countUrgent);
    for (const k of ['alt', 'speed', 'dist', 'gear', 'ramp']) {
      if (L[k] !== s[k]) { L[k] = s[k]; this.q(`[data-k="${k}"]`).textContent = s[k]; }
    }
    const w = (s.progress * 100).toFixed(1) + '%';
    if (L.w !== w) { L.w = w; this.refs.fill.style.width = w; }
  }
  setVisible(v) { this.el.style.display = v ? '' : 'none'; }
  dispose() { this.el.remove(); }
}
