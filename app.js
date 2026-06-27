/* ============================================================
   Jab — application logic
   Hash router, search, dark/light theme, Letterboxd-style fighter
   profiles, latest news, and a fan comments section (stored in the
   browser via localStorage). No build step, no dependencies.
   ============================================================ */

(function () {
  "use strict";

  const FIGHTERS = window.FIGHTERS;
  const PROMOTERS = window.PROMOTERS;
  const byId = (id) => FIGHTERS.find((f) => f.id === id);
  const promoterById = (id) => PROMOTERS.find((p) => p.id === id);
  const app = document.getElementById("app");

  /* ---------------- Theme ---------------- */
  const THEME_KEY = "jab:theme";
  function initTheme() {
    let t = localStorage.getItem(THEME_KEY);
    if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    applyTheme(t);
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem(THEME_KEY, t);
    const btn = document.getElementById("themeBtn");
    if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    applyTheme(cur === "dark" ? "light" : "dark");
  }

  /* ---------------- Small utilities ---------------- */
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
    return Math.abs(h);
  }
  const AVATAR_PALETTE = [
    ["#6b7bf0", "#9b6bf0"], ["#e07a6b", "#e0a86b"], ["#4fae8c", "#4f9eae"],
    ["#d9a441", "#d97b41"], ["#7b8df0", "#6bbef0"], ["#c06be0", "#e06ba8"],
    ["#5fae6b", "#aeae5f"], ["#6b9bf0", "#6be0c0"], ["#e06b8a", "#e0696b"],
    ["#8a7bf0", "#b07bf0"],
  ];
  function gradOf(id, name) { return AVATAR_PALETTE[hashStr(id || name) % AVATAR_PALETTE.length]; }
  function initials(name) {
    const p = name.split(" ").filter(Boolean);
    return ((p[0] || "")[0] || "") + ((p[p.length - 1] || "")[0] || "");
  }
  function avatar(name, id, cls) {
    const g = gradOf(id, name);
    return `<div class="avatar ${cls || ""}" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${initials(name).toUpperCase()}</div>`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // Resolve a stored Wikimedia thumb URL to a width that always renders.
  // Wikimedia 400s on widths larger than the source; Special:FilePath caps
  // to the nearest available rendition automatically.
  function wmImage(url) {
    if (!url) return "";
    const m = url.match(/\/thumb\/[0-9a-fA-F]\/[0-9a-fA-F]{2}\/([^/]+)\//);
    return m ? "https://commons.wikimedia.org/wiki/Special:FilePath/" + m[1] + "?width=480" : url;
  }
  // A distinct Wikimedia Commons photo per fighter to use as the page backdrop
  // (kept separate from the portrait). Fighters not listed fall back to the
  // themed gradient backdrop (no free second/any photo exists for them).
  const BACKDROPS = {
    "naoya-inoue": "Naoya Inoue 20260502.png",
    "oleksandr-usyk": "Oleksandr Usyk at TIFF 2025.jpg",
    "shakur-stevenson": "ShakurStevenson.jpg",
    "islam-makhachev": "Islam Makhachev 2023.jpg",
    "alexander-volkanovski": "Alex Volkanovski.jpg",
    "petr-yan": "PetrYan.jpg",
    "justin-gaethje": "Justin Gaethje at press conference.png",
    "ilia-topuria": "UFC Freedom 250 Ceremonial Weigh In (9748627)(cropped).jpg",
    "sean-strickland": "Sean Strickland 2022.jpg",
    "alex-pereira": "Alex Pereira UFC 300.png",
    "merab-dvalishvili": "Merab Dvalishvili 2022.png",
    "ciryl-gane": "UFC Freedom 250 Ceremonial Weigh In (9748626).jpg",
    "khamzat-chimaev": "KhamzatChimaev(fighter).png",
    "alexandre-pantoja": "Alexandre Pantoja.png",
    "arman-tsarukyan": "Arman Tsarukyan 2024.png",
    "charles-oliveira": "Charles Oliveira UFC (51605790635).jpg",
  };
  function backdropUrl(id) {
    const f = BACKDROPS[id];
    return f ? "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f) + "?width=1200" : "";
  }
  function recordStr(f) {
    const r = f.record;
    let s = `${r.w}-${r.l}-${r.d}`;
    if (r.nc) s += ` (${r.nc} NC)`;
    if (f.sport === "boxing" && r.ko != null) s += ` · ${r.ko} KO`;
    return s;
  }
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  function fmtDateShort(iso) {
    const d = new Date(iso + "T00:00:00");
    return {
      mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      day: d.getDate(),
      year: d.getFullYear(),
    };
  }
  function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const days = Math.floor(diff / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + "d ago";
    if (days < 365) return Math.floor(days / 30) + "mo ago";
    return Math.floor(days / 365) + "y ago";
  }

  /* ---------------- Comments (localStorage) ---------------- */
  const userComments = (id) => JSON.parse(localStorage.getItem("jab:comments:" + id) || "[]");
  const saveUserComments = (id, arr) => localStorage.setItem("jab:comments:" + id, JSON.stringify(arr));

  /* ---------------- Reusable fragments ---------------- */
  function sportBadge(sport) {
    return sport === "boxing"
      ? `<span class="badge-sport boxing">Boxing</span>`
      : `<span class="badge-sport mma">MMA</span>`;
  }
  function rankChipClass(n) { return n === 1 ? "r1" : n === 2 ? "r2" : n === 3 ? "r3" : ""; }
  function rankOf(f) { return f.sport === "boxing" ? f.ringRank : f.ufcRank; }

  function fighterCard(f) {
    const rank = rankOf(f);
    return `
      <a class="f-card" href="#/fighter/${f.id}">
        ${rank ? `<span class="rank-chip ${rankChipClass(rank)}">#${rank} P4P</span>` : ""}
        ${avatar(f.name, f.id)}
        <div class="f-name">${escapeHtml(f.name)} <span title="${escapeHtml(f.nationality)}">${f.flag}</span></div>
        <div class="f-nick">${f.nickname ? '"' + escapeHtml(f.nickname) + '"' : "&nbsp;"}</div>
        <div class="f-div">${sportBadge(f.sport)} <span>${escapeHtml(f.division)}</span></div>
        <div class="f-record">
          <span class="rec">${recordStr(f)}</span>
        </div>
      </a>`;
  }

  function rankRow(f) {
    const rank = rankOf(f);
    return `
      <a class="rank-row" href="#/fighter/${f.id}">
        <div class="rnum ${rankChipClass(rank)}">${rank}</div>
        ${avatar(f.name, f.id)}
        <div class="r-main">
          <div class="r-name">${escapeHtml(f.name)} <span title="${escapeHtml(f.nationality)}">${f.flag}</span></div>
          <div class="r-sub">${escapeHtml(f.division)}${f.nickname ? ' · "' + escapeHtml(f.nickname) + '"' : ""}</div>
        </div>
        <div class="r-record">
          <b>${f.record.w}-${f.record.l}-${f.record.d}</b>
          <small>${f.sport === "boxing" ? f.record.ko + " KO" : "MMA"}</small>
        </div>
      </a>`;
  }

  /* ---------------- List views ---------------- */
  function viewHome() {
    const boxing = FIGHTERS.filter((f) => f.sport === "boxing").sort((a, b) => a.ringRank - b.ringRank);
    const mma = FIGHTERS.filter((f) => f.sport === "mma").sort((a, b) => a.ufcRank - b.ufcRank);
    const featured = boxing.slice(0, 3).concat(mma.slice(0, 3));
    return `
      <section class="hero">
        <div class="wrap">
          <h1>The fan's home for <span class="grad">boxing &amp; MMA</span>.</h1>
          <p>Rankings, fighter profiles, schedules, promoters and the latest news — plus a place for fans like you to talk fights. Follow the pound-for-pound elite of The Ring and the UFC, all in one place.</p>
          <div class="hero-search">
            <div class="search-box">
              <span class="s-icon">🔎</span>
              <input id="heroSearch" type="text" placeholder="Search a fighter, division or promoter…" autocomplete="off">
            </div>
          </div>
          <div class="hero-stats">
            <div class="stat"><b>${FIGHTERS.length}</b><span>Fighter profiles</span></div>
            <div class="stat"><b>${PROMOTERS.length}</b><span>Promoters</span></div>
            <div class="stat"><b>2</b><span>P4P rankings</span></div>
            <div class="stat"><b>25+</b><span>News stories</span></div>
          </div>
        </div>
      </section>

      <div class="wrap">
        <div class="section-head">
          <span class="tag tag-boxing">The Ring</span>
          <h2>Boxing — Pound&#8209;for&#8209;Pound Top 10</h2>
          <span class="grow"></span>
          <a class="more" href="#/boxing">View all →</a>
        </div>
        <div class="rank-list">${boxing.slice(0, 5).map(rankRow).join("")}</div>

        <div class="section-head">
          <span class="tag tag-mma">UFC</span>
          <h2>MMA — Pound&#8209;for&#8209;Pound Top 15</h2>
          <span class="grow"></span>
          <a class="more" href="#/mma">View all →</a>
        </div>
        <div class="rank-list">${mma.slice(0, 5).map(rankRow).join("")}</div>

        <div class="section-head"><h2>Featured fighters</h2></div>
        <div class="grid">${featured.map(fighterCard).join("")}</div>
      </div>`;
  }

  function viewRankings(sport) {
    const isBox = sport === "boxing";
    const list = FIGHTERS.filter((f) => f.sport === sport)
      .sort((a, b) => (isBox ? a.ringRank - b.ringRank : a.ufcRank - b.ufcRank));
    const divisions = ["All"].concat([...new Set(list.map((f) => f.division))]);
    const active = state.divFilter || "All";
    const shown = active === "All" ? list : list.filter((f) => f.division === active);
    return `
      <div class="wrap">
        <a class="back-link" href="#/">← Home</a>
        <div class="section-head">
          <span class="tag ${isBox ? "tag-boxing" : "tag-mma"}">${isBox ? "The Ring" : "UFC"}</span>
          <h2>${isBox ? "Boxing" : "MMA"} Pound&#8209;for&#8209;Pound</h2>
        </div>
        <p style="color:var(--text-soft);margin-top:-6px">${isBox
          ? "The Ring Magazine's official pound-for-pound elite — the ten best boxers on the planet regardless of weight class."
          : "The UFC's official men's pound-for-pound Top 15 — the best mixed martial artists in the promotion across every division."}</p>
        <div class="pillbar">
          ${divisions.map((d) => `<button class="pill ${d === active ? "active" : ""}" data-div="${escapeHtml(d)}">${escapeHtml(d)}</button>`).join("")}
        </div>
        <div class="rank-list">${shown.map(rankRow).join("")}</div>
      </div>`;
  }

  function viewPromoters() {
    return `
      <div class="wrap">
        <a class="back-link" href="#/">← Home</a>
        <div class="section-head"><h2>Promoters</h2></div>
        <p style="color:var(--text-soft);margin-top:-6px">The companies that make the fights — and the champions they represent.</p>
        <div class="promoter-grid">
          ${PROMOTERS.map((p) => {
            const fs = FIGHTERS.filter((f) => f.promoterId === p.id);
            const g = gradOf(p.id);
            return `
              <div class="promoter-card">
                <div class="pc-head">
                  <div class="pc-logo" style="background:linear-gradient(135deg,${g[0]},${g[1]})">${escapeHtml(initials(p.name).toUpperCase())}</div>
                  <div>
                    <h3>${escapeHtml(p.name)}</h3>
                    <div class="pc-sub">${sportBadge(p.sport)} · Est. ${p.founded}</div>
                  </div>
                </div>
                <p>${escapeHtml(p.description)}</p>
                <div class="pc-meta">
                  <div class="m"><b>${escapeHtml(p.head)}</b><span>Leadership</span></div>
                  <div class="m"><b>${escapeHtml(p.hq)}</b><span>Headquarters</span></div>
                </div>
                ${fs.length ? `<div class="pc-fighters">${fs.map((f) => `<a href="#/fighter/${f.id}">${f.flag} ${escapeHtml(f.name)}</a>`).join("")}</div>` : ""}
              </div>`;
          }).join("")}
        </div>
      </div>`;
  }

  function viewSearch(query) {
    const q = (query || "").trim().toLowerCase();
    const res = q ? FIGHTERS.filter((f) =>
      f.name.toLowerCase().includes(q) ||
      (f.nickname || "").toLowerCase().includes(q) ||
      f.division.toLowerCase().includes(q) ||
      f.nationality.toLowerCase().includes(q) ||
      f.sport.includes(q) ||
      (promoterById(f.promoterId) || {}).name?.toLowerCase().includes(q)
    ) : [];
    return `
      <div class="wrap">
        <a class="back-link" href="#/">← Home</a>
        <div class="section-head"><h2>Search results for "${escapeHtml(query)}"</h2></div>
        ${res.length
          ? `<p style="color:var(--text-soft);margin-top:-6px">${res.length} fighter${res.length > 1 ? "s" : ""} found.</p><div class="grid">${res.map(fighterCard).join("")}</div>`
          : `<div class="empty-state"><div class="big">🥊</div><p>No fighters matched your search.<br>Try a name like "Inoue" or a division like "Lightweight".</p></div>`}
      </div>`;
  }

  /* ---------------- Fighter profile (Letterboxd-style) ---------------- */
  const SOCIAL_NAME = { instagram: "Instagram", x: "X (Twitter)", youtube: "YouTube", facebook: "Facebook", tiktok: "TikTok", web: "Website" };
  const SOCIAL_SVG = {
    instagram: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23 22h-6.8l-5.3-7-6.1 7H1.7l8.2-9.4L1 2h7l4.8 6.4L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .8 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.2 12 31 31 0 0 0 23 7.5ZM9.8 15.3V8.7l5.7 3.3-5.7 3.3Z"/></svg>`,
    facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 9V7c0-1 .3-1.5 1.6-1.5H17V2.2C16.6 2.1 15.5 2 14.4 2 11.8 2 10 3.6 10 6.5V9H7.5v3.5H10V22h4v-9.5h2.7l.4-3.5H14Z"/></svg>`,
    tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 3c.3 2.1 1.5 3.6 3.6 4v2.6c-1.3 0-2.5-.4-3.6-1.1v5.6A5.5 5.5 0 1 1 10 8.6v2.8a2.7 2.7 0 1 0 1.9 2.6V3H16Z"/></svg>`,
    web: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/></svg>`,
  };

  function posterCard(f) {
    const g = gradOf(f.id, f.name);
    const rank = rankOf(f);
    const src = wmImage(f.image);
    const img = src ? `<img class="poster-img" src="${escapeHtml(src)}" alt="${escapeHtml(f.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
    return `
      <div class="poster" style="background:linear-gradient(160deg,${g[0]},${g[1]})">
        <div class="poster-initials">${escapeHtml(initials(f.name).toUpperCase())}</div>
        ${img}
        ${rank ? `<span class="poster-rank">#${rank} P4P</span>` : ""}
        <div class="poster-plate">
          <div class="pp-flag">${f.flag}</div>
          <div class="pp-name">${escapeHtml(f.name)}</div>
          <div class="pp-rec">${recordStr(f)}</div>
        </div>
      </div>`;
  }

  function titlesBlock(f) {
    const titles = f.currentTitles || [];
    const body = titles.length
      ? `<ul class="title-list">${titles.map((t) => `<li><span class="belt">🏆</span> ${escapeHtml(t)}</li>`).join("")}</ul>`
      : `<div class="no-title"><span class="nt-ico">●</span> No active titles${f.standing ? ` <span class="nt-sub">— ${escapeHtml(f.standing)}</span>` : ""}</div>`;
    return `
      <div class="side-card">
        <h4 class="side-h">Current Titles</h4>
        ${body}
      </div>`;
  }

  function socialBlock(f) {
    const socials = Object.entries(f.social || {});
    if (!socials.length) return "";
    return `
      <div class="side-card">
        <h4 class="side-h">Social Media</h4>
        <div class="social-row">
          ${socials.map(([k, url]) => `<a class="social-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="${SOCIAL_NAME[k] || k}" aria-label="${SOCIAL_NAME[k] || k}">${SOCIAL_SVG[k] || SOCIAL_SVG.web}</a>`).join("")}
        </div>
      </div>`;
  }

  function statBar(f) {
    const m = f.methods || {};
    const r = f.record, rank = rankOf(f);
    const finishes = f.sport === "boxing" ? (m.ko || 0) : (m.ko || 0) + (m.sub || 0);
    const pct = r.w ? Math.round((finishes / r.w) * 100) : 0;
    const tiles = [
      [`${r.w}-${r.l}-${r.d}`, "Pro Record"],
      [String(finishes), f.sport === "boxing" ? "Knockouts" : "Finishes"],
      [`${pct}%`, f.sport === "boxing" ? "KO Ratio" : "Finish Rate"],
      [rank ? `#${rank}` : "—", f.sport === "boxing" ? "Ring P4P" : "UFC P4P"],
    ];
    return `<div class="statbar">${tiles.map((t) => `<div class="stat-pill"><b>${t[0]}</b><span>${t[1]}</span></div>`).join("")}</div>`;
  }

  function tapePanel(f) {
    const promoter = promoterById(f.promoterId);
    const rows = [
      ["Division", f.division],
      ["Age", String(f.age)],
      ["Stance", f.stance],
      ["Height", f.height],
      ["Reach", f.reach],
      ["Born", fmtDate(f.dob)],
      ["Hometown", f.hometown],
      ["Nationality", f.nationality],
      ["Pro debut", String(f.debut)],
      ["Promoter", promoter ? promoter.name : "—"],
    ];
    return `<div class="tape">${rows.map((r) =>
      `<div class="t-row"><span>${escapeHtml(r[0])}</span><b>${escapeHtml(r[1])}</b></div>`).join("")}</div>`;
  }

  function schedulePanel(f) {
    const up = (f.upcoming || []).map((b) => {
      const d = fmtDateShort(b.date);
      return `
        <div class="fight-row">
          <div class="fight-date"><b>${d.day}</b>${d.mon} ${d.year}</div>
          <div class="fight-info">
            <div class="fi-opp">vs ${escapeHtml(b.opponent)}</div>
            <div class="fi-event">${escapeHtml(b.event)}${b.venue ? " · " + escapeHtml(b.venue) : ""}</div>
          </div>
          <div class="fight-result up">Upcoming</div>
        </div>`;
    }).join("");
    const recent = (f.recent || []).map((b) => {
      const d = fmtDateShort(b.date);
      const cls = b.result === "W" ? "W" : b.result === "L" ? "L" : "nc";
      const label = b.result === "W" ? "Win" : b.result === "L" ? "Loss" : b.result === "NC" ? "No Contest" : "Draw";
      return `
        <div class="fight-row">
          <div class="fight-date"><b>${d.day}</b>${d.mon} ${d.year}</div>
          <div class="fight-info">
            <div class="fi-opp">vs ${escapeHtml(b.opponent)}</div>
            <div class="fi-event">${escapeHtml(b.event)} · ${escapeHtml(b.method)}${b.round ? " R" + b.round : ""}</div>
          </div>
          <div class="fight-result ${cls}">${label}</div>
        </div>`;
    }).join("");
    return `
      ${up ? `<h4 class="panel-sub">📅 Upcoming bouts</h4><div class="fight-list">${up}</div>` : ""}
      <h4 class="panel-sub" style="${up ? "margin-top:18px" : ""}">📜 Fight history</h4>
      <div class="fight-list">${recent || '<p class="muted-p">No bouts on record.</p>'}</div>
      ${f.recordUrl ? `<a class="record-link" href="${escapeHtml(f.recordUrl)}" target="_blank" rel="noopener noreferrer">View full professional record ↗</a>` : ""}`;
  }

  function newsPanel(f) {
    const items = f.news || [];
    if (!items.length) return '<p class="muted-p">No recent news.</p>';
    return `<div class="news-list">${items.map((n) => `
      <a class="news-item" href="${escapeHtml(n.u)}" target="_blank" rel="noopener noreferrer">
        <div class="news-source">${escapeHtml(n.s)}</div>
        <div class="news-body">
          <div class="news-title">${escapeHtml(n.t)} <span class="news-ext">↗</span></div>
          <div class="news-meta">${n.d ? fmtDate(n.d) : ""} · ${escapeHtml(n.s)}</div>
        </div>
      </a>`).join("")}</div>
      <p class="news-disclaimer">Headlines link to external reporting from third-party sources. Jab is not affiliated with these outlets.</p>`;
  }

  function commentsPanel(f) {
    const cs = userComments(f.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const list = cs.map((c) => `
      <div class="comment">
        ${avatar(c.who, c.who, "mini")}
        <div class="c-body">
          <div class="c-head"><span class="c-who">${escapeHtml(c.who)}</span><span class="c-when">${timeAgo(c.date)}</span></div>
          <p class="c-text">${escapeHtml(c.text)}</p>
        </div>
      </div>`).join("");
    return `
      <form class="form" id="commentForm">
        <label for="cmName">Display name</label>
        <input type="text" id="cmName" maxlength="30" placeholder="Your name">
        <label for="cmText">Comment</label>
        <textarea id="cmText" rows="3" maxlength="400" placeholder="Join the conversation…"></textarea>
        <button class="btn" type="submit">Post comment</button>
      </form>
      <hr class="divider" style="margin:18px 0">
      <div id="commentList">${list || '<p class="muted-p">No comments yet. Start the discussion!</p>'}</div>`;
  }

  function viewFighter(id) {
    const f = byId(id);
    if (!f) return `<div class="wrap"><div class="empty-state"><div class="big">🤔</div><p>Fighter not found.</p><a class="btn" href="#/" style="display:inline-block">Back home</a></div></div>`;
    const g = gradOf(f.id, f.name);
    const promoter = promoterById(f.promoterId);
    const tagline = (f.currentTitles && f.currentTitles.length ? f.currentTitles[0] : (f.standing || `${f.division} contender`));
    const commentCount = userComments(f.id).length;
    const newsCount = (f.news || []).length;

    const tabs = [
      ["tape", "Tale of the Tape"],
      ["schedule", "Schedule"],
      ["news", `News${newsCount ? " · " + newsCount : ""}`],
      ["comments", `Comments${commentCount ? " · " + commentCount : ""}`],
    ];

    return `
      <div class="fp-backdrop" style="background:linear-gradient(120deg,${g[0]},${g[1]})">
        ${backdropUrl(f.id) ? `<img class="fp-backdrop-img" src="${escapeHtml(backdropUrl(f.id))}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
      </div>
      <div class="wrap fp-wrap">
        <a class="back-link" href="${f.sport === "boxing" ? "#/boxing" : "#/mma"}">← ${f.sport === "boxing" ? "Boxing" : "MMA"} rankings</a>

        <div class="lb-layout">
          <aside class="lb-poster-col">
            ${posterCard(f)}
            ${titlesBlock(f)}
            ${socialBlock(f)}
          </aside>

          <main class="lb-main">
            <div class="lb-head">
              <h1 class="lb-title">${escapeHtml(f.name)} <span class="lb-flag" title="${escapeHtml(f.nationality)}">${f.flag}</span></h1>
              <div class="lb-sub">${sportBadge(f.sport)} <span>${escapeHtml(f.division)}</span>${f.nickname ? ` · <em>"${escapeHtml(f.nickname)}"</em>` : ""}</div>
              <div class="lb-by">Fighting out of ${escapeHtml(f.hometown)}</div>
              ${promoter ? `<div class="lb-by">Promoted by <a href="#/promoters">${escapeHtml(promoter.name)}</a></div>` : ""}
            </div>

            <p class="lb-tagline">${escapeHtml(tagline)}</p>
            <p class="lb-bio">${escapeHtml(f.bio)}</p>

            ${statBar(f)}

            <nav class="lb-tabs" id="lbTabs">
              ${tabs.map((t, i) => `<button class="lb-tab ${i === 0 ? "active" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("")}
            </nav>

            <section class="lb-panel active" data-panel="tape">
              <h3 class="panel-title">Tale of the Tape</h3>
              ${tapePanel(f)}
            </section>
            <section class="lb-panel" data-panel="schedule">
              <h3 class="panel-title">Fight Schedule</h3>
              ${schedulePanel(f)}
            </section>
            <section class="lb-panel" data-panel="news">
              <h3 class="panel-title">Latest News</h3>
              ${newsPanel(f)}
            </section>
            <section class="lb-panel" data-panel="comments">
              <h3 class="panel-title">Fan Comments</h3>
              ${commentsPanel(f)}
            </section>
          </main>
        </div>
      </div>`;
  }

  /* ---------------- Post-render wiring ---------------- */
  function toast(msg) {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add("show"));
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function wireFighter(id) {
    const f = byId(id);
    if (!f) return;

    // Tab switching (no re-render — just toggle visibility)
    const tabBar = document.getElementById("lbTabs");
    if (tabBar) {
      tabBar.addEventListener("click", (e) => {
        const btn = e.target.closest(".lb-tab");
        if (!btn) return;
        const target = btn.dataset.tab;
        tabBar.querySelectorAll(".lb-tab").forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".lb-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === target));
      });
    }

    const commentForm = document.getElementById("commentForm");
    if (commentForm) {
      commentForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const who = document.getElementById("cmName").value.trim() || "Anonymous Fan";
        const text = document.getElementById("cmText").value.trim();
        if (!text) return toast("Write a comment first 💬");
        const arr = userComments(id);
        arr.push({ id: "c" + Date.now(), who, text, date: new Date().toISOString() });
        saveUserComments(id, arr);
        toast("Comment posted! 💬");
        // Re-render just the comments panel + keep the Comments tab active
        rerenderComments(id);
      });
    }
  }

  function rerenderComments(id) {
    const f = byId(id);
    const panel = document.querySelector('.lb-panel[data-panel="comments"]');
    if (!panel) return;
    panel.innerHTML = `<h3 class="panel-title">Fan Comments</h3>${commentsPanel(f)}`;
    // ensure Comments tab stays active/visible
    document.querySelectorAll(".lb-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "comments"));
    document.querySelectorAll(".lb-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === "comments"));
    // update the tab label count
    const tab = document.querySelector('.lb-tab[data-tab="comments"]');
    const n = userComments(id).length;
    if (tab) tab.textContent = "Comments" + (n ? " · " + n : "");
    // re-wire the new form
    const commentForm = document.getElementById("commentForm");
    if (commentForm) {
      commentForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const who = document.getElementById("cmName").value.trim() || "Anonymous Fan";
        const text = document.getElementById("cmText").value.trim();
        if (!text) return toast("Write a comment first 💬");
        const arr = userComments(id);
        arr.push({ id: "c" + Date.now(), who, text, date: new Date().toISOString() });
        saveUserComments(id, arr);
        toast("Comment posted! 💬");
        rerenderComments(id);
      });
    }
  }

  function wireRankings() {
    document.querySelectorAll(".pill[data-div]").forEach((b) => {
      b.addEventListener("click", () => { state.divFilter = b.dataset.div; render(); });
    });
  }

  function wireHeroSearch() {
    const el = document.getElementById("heroSearch");
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && el.value.trim()) location.hash = "#/search/" + encodeURIComponent(el.value.trim());
    });
  }

  /* ---------------- Router ---------------- */
  const state = { divFilter: "All", route: "" };

  function render() {
    const hash = location.hash || "#/";
    const parts = hash.replace(/^#\//, "").split("/");
    const route = parts[0] || "";
    if (route !== state.route) { state.divFilter = "All"; state.route = route; }

    let html = "";
    if (route === "") html = viewHome();
    else if (route === "boxing") html = viewRankings("boxing");
    else if (route === "mma") html = viewRankings("mma");
    else if (route === "promoters") html = viewPromoters();
    else if (route === "fighter") html = viewFighter(parts[1]);
    else if (route === "search") html = viewSearch(decodeURIComponent(parts[1] || ""));
    else html = viewHome();

    app.innerHTML = html;
    window.scrollTo(0, 0);
    setActiveNav(route);

    if (route === "fighter") wireFighter(parts[1]);
    if (route === "boxing" || route === "mma") wireRankings();
    if (route === "") wireHeroSearch();
    closeMenu();
  }

  function setActiveNav(route) {
    document.querySelectorAll(".nav a").forEach((a) => {
      const r = a.getAttribute("data-route");
      a.classList.toggle("active", r === route || (r === "" && route === ""));
    });
  }

  /* ---------------- Header search (live dropdown) ---------------- */
  function setupHeaderSearch() {
    const input = document.getElementById("headerSearch");
    const drop = document.getElementById("searchResults");
    if (!input || !drop) return;
    const run = () => {
      const q = input.value.trim().toLowerCase();
      if (!q) { drop.classList.remove("open"); return; }
      const res = FIGHTERS.filter((f) =>
        f.name.toLowerCase().includes(q) ||
        (f.nickname || "").toLowerCase().includes(q) ||
        f.division.toLowerCase().includes(q) ||
        f.nationality.toLowerCase().includes(q)
      ).slice(0, 7);
      drop.innerHTML = res.length
        ? res.map((f) => `
          <a class="sr-item" href="#/fighter/${f.id}">
            ${avatar(f.name, f.id, "mini")}
            <div><div style="font-weight:650;font-size:.9rem">${escapeHtml(f.name)} ${f.flag}</div>
            <div class="sr-meta">${escapeHtml(f.division)} · ${f.sport === "boxing" ? "Boxing" : "MMA"}</div></div>
          </a>`).join("")
        : `<div class="sr-empty">No fighters found for "${escapeHtml(input.value)}"</div>`;
      drop.classList.add("open");
    };
    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        location.hash = "#/search/" + encodeURIComponent(input.value.trim());
        drop.classList.remove("open"); input.blur();
      }
      if (e.key === "Escape") { drop.classList.remove("open"); input.blur(); }
    });
    drop.addEventListener("click", () => { drop.classList.remove("open"); input.value = ""; });
    document.addEventListener("click", (e) => {
      if (!drop.contains(e.target) && e.target !== input) drop.classList.remove("open");
    });
  }

  /* ---------------- Mobile menu ---------------- */
  function toggleMenu() { document.querySelector(".nav").classList.toggle("open"); }
  function closeMenu() { const n = document.querySelector(".nav"); if (n) n.classList.remove("open"); }

  /* ---------------- Init ---------------- */
  function init() {
    initTheme();
    document.getElementById("themeBtn").addEventListener("click", toggleTheme);
    document.getElementById("menuToggle").addEventListener("click", toggleMenu);
    setupHeaderSearch();
    window.addEventListener("hashchange", render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
