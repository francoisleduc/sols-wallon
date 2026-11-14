"use strict";

const NS = "http://www.w3.org/2000/svg";
const etat = { langue: "fr", meta: null, communes: [], parCode: new Map(), bassins: [], wallonie: null, paquets: new Map(), mesure: "part", filtreBassin: "", tri: { cle: "nom", sens: 1 } };
try { if (localStorage.getItem("sols-langue") === "en") etat.langue = "en"; } catch { /* français par défaut */ }

/* Traduction : la clé est le texte français, {} marquant une valeur insérée (voir assets/en.js).
   S'emploie en tr("Texte") ou tr`Texte ${valeur}`. Une clé absente laisse le français et est notée. */
const textesManquants = new Set();
window.textesManquants = textesManquants;
function tr(s, ...v) {
  const en = etat.langue === "en" ? (window.TEXTES_EN || {}) : null;
  if (typeof s === "string") {
    if (!en) return s;
    if (s in en) return en[s];
    textesManquants.add(s);
    return s;
  }
  const cle = s.join("{}");
  if (en && cle in en) {
    let i = 0;
    return en[cle].replace(/\{(\d*)\}/g, (_, n) => String(v[n === "" ? i++ : Number(n)]));
  }
  if (en) textesManquants.add(cle);
  return s.reduce((acc, x, i) => acc + x + (i < v.length ? v[i] : ""), "");
}
const enAnglais = () => etat.langue === "en";
const texteP = (p) => (enAnglais() ? p.texte_en : p.texte);
const natureL = (n) => (enAnglais() ? n.nature_en : n.nature);
const categorieL = (n) => (enAnglais() ? n.categorie_en : n.categorie);
const nomZone = (b) => (b.cle === "wallonie" && enAnglais() ? "Wallonia, excluding the German-speaking Community" : b.nom);
const vue = document.getElementById("vue");

/* ---------- Écriture ---------- */
const nombre = (v, d = 0) => new Intl.NumberFormat(etat.langue === "en" ? "en-GB" : "fr-BE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v).replace("-", "−");
const signe = (v, d = 0) => (v > 0 ? "+" : v < 0 ? "−" : "") + nombre(Math.abs(v), d);
const ha = (v) => nombre(v, Math.abs(v) < 100 ? 1 : 0);
const insecables = (t) => String(t).replace(/ (%|:|;|\?|»|ha\b|km²|points?\b)/g, " $1").replace(/« /g, "« ").replace(/(\d) (ha|%)/g, "$1 $2");
const sansAccent = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const pluriel = (n, un, plusieurs) => (n >= 2 ? plusieurs : un);

function h(tag, attrs, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of enfants.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : insecables(c));
  return e;
}
function s(tag, attrs, ...enfants) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) e.setAttribute(k, v);
  for (const c of enfants) e.append(c);
  return e;
}

let SITUATIONS, SIGNAUX;
function textesStatuts() {
SITUATIONS = {
  "au-dessus": ["▲", tr("Au-dessus de sa trajectoire"), tr("au-dessus de sa trajectoire")],
  "en-dessous": ["▼", tr("Sous sa trajectoire"), tr("sous sa trajectoire")],
  proche: ["≈", tr("Proche de sa trajectoire"), tr("proche de sa trajectoire")],
};
SIGNAUX = {
  "plus rapide": ["▲", tr("Rythme plus rapide qu'avant"), "neutre", tr("Plus rapide")],
  "plus lent": ["▼", tr("Rythme plus lent qu'avant"), "neutre", tr("Plus lent")],
  comparable: ["=", tr("Rythme comparable"), "neutre", tr("Comparable")],
  incertain: ["◆", tr("Rythme difficile à juger"), "incertain", tr("Difficile à juger")],
};
}
const marqueSituation = (b) => h("span", { class: `situation ${b.statut}` }, h("i", { "aria-hidden": "true" }, SITUATIONS[b.statut][0]), SITUATIONS[b.statut][1]);
function marqueSignal(cle, court) {
  const [icone, texte, classe, bref] = SIGNAUX[cle];
  return h("span", { class: `statut ${classe}` }, h("i", { "aria-hidden": "true" }, icone), court ? bref : texte);
}
/* Le bilan d'un bassin ne compte que les années définitives : la dernière année est provisoire (voir la Méthode). */
const anneesBilan = () => [etat.meta.trajectoire_debut, etat.meta.derniere_annee_flux - 1];
const prochePct = () => etat.meta.ecart_proche_pct;
/* Écart au cumul de la trajectoire, en mots : « 10 % de plus », « 16 % de moins », ou « proche ». */
function ecartBilan(b) {
  const e = Math.abs(Math.round(b.ratio * 100) - 100);  // depuis le pourcentage affiché, pour que les deux s'additionnent
  if (b.statut === "au-dessus") return tr`C'est ${nombre(e)} % de plus que la trajectoire.`;
  if (b.statut === "en-dessous") return tr`C'est ${nombre(e)} % de moins que la trajectoire.`;
  return tr`À moins de ${prochePct()} % près, c'est le niveau de la trajectoire.`;
}
const constatBassin = (b) => h("p", { class: "constat" },
  h("span", { class: "constat-chiffre" }, tr`${nombre(b.ratio * 100)} %`),
  h("span", { class: "constat-texte" }, tr("du cumul prévu par la trajectoire")), marqueSituation(b));
/* Thème : clair par défaut, quel que soit le réglage du système. Le choix du visiteur est retenu quand le navigateur le permet. */
function afficherTheme() {
  const bouton = document.getElementById("bouton-theme");
  const sombre = document.documentElement.dataset.theme === "dark";
  bouton.querySelector("span").textContent = sombre ? tr("Clair") : tr("Sombre");
  bouton.setAttribute("aria-label", sombre ? tr("Passer au thème clair") : tr("Passer au thème sombre"));
}
function brancherTheme() {
  document.getElementById("bouton-theme").addEventListener("click", () => {
    const racine = document.documentElement;
    racine.dataset.theme = racine.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("sols-theme", racine.dataset.theme); } catch { /* le choix vaut alors pour cette visite */ }
    afficherTheme();
  });
}
const tuile = (titre, valeur, petit) => h("div", null, h("dt", null, titre), h("dd", null, valeur), petit ? h("small", null, petit) : null);

/* Corps et marge de repères : voir .grille dans la feuille de style. */
function grille({ tete, corps, haut, bas, colle, classe }) {
  return h("div", { class: `grille ${classe || ""}` },
    h("div", { class: "g-tete" }, tete),
    h("div", { class: "g-corps" }, corps),
    h("aside", { class: `g-marge ${colle ? "colle" : ""}` }, h("div", { class: "g-haut" }, haut), bas ? h("div", { class: "g-bas" }, bas) : null));
}

/* ---------- Échelles ---------- */
function reperes(min, max, n = 4) {
  if (max === min) max = min + 1;
  const brut = (max - min) / n, puissance = 10 ** Math.floor(Math.log10(brut)), f = brut / puissance;
  const pas = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * puissance;
  const sortie = [];
  for (let v = Math.ceil(min / pas) * pas; v <= max + pas * 1e-6; v += pas) sortie.push(Math.abs(v) < pas * 1e-6 ? 0 : v);
  return { valeurs: sortie, pas };
}
const lineaire = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/* Redessine un graphique à chaque changement de largeur, pour garder un texte lisible sur téléphone. */
function graphique(parent, aria, dessine) {
  const boite = h("div", { class: "graphique" });
  parent.append(boite);
  let derniere = 0;
  const trace = () => {
    const largeur = Math.round(boite.clientWidth);
    if (!largeur || largeur === derniere) return;
    derniere = largeur;
    boite.replaceChildren();
    dessine(boite, largeur, aria);
  };
  new ResizeObserver(trace).observe(boite);
  requestAnimationFrame(trace);
  return boite;
}

function creerSvg(boite, largeur, hauteur, aria) {
  const svg = s("svg", { width: largeur, height: hauteur, viewBox: `0 0 ${largeur} ${hauteur}`, role: "img", "aria-label": aria });
  boite.append(svg);
  return svg;
}

function activerSurvol(boite, svg, zone, positions, contenu) {
  const bulle = h("div", { class: "bulle", hidden: true });
  boite.append(bulle);
  const trait = s("line", { class: "curseur", y1: zone.haut, y2: zone.bas, visibility: "hidden" });
  svg.append(trait);
  const capteur = s("rect", { x: zone.gauche, y: zone.haut, width: zone.droite - zone.gauche, height: zone.bas - zone.haut, fill: "transparent" });
  svg.append(capteur);
  const masquer = () => { bulle.hidden = true; trait.setAttribute("visibility", "hidden"); };
  capteur.addEventListener("pointermove", (ev) => {
    const cadre = svg.getBoundingClientRect();
    const x = ev.clientX - cadre.left;
    let i = 0, ecart = Infinity;
    positions.forEach((p, k) => { const d = Math.abs(p - x); if (d < ecart) { ecart = d; i = k; } });
    trait.setAttribute("x1", positions[i]); trait.setAttribute("x2", positions[i]); trait.setAttribute("visibility", "visible");
    bulle.replaceChildren(...contenu(i));
    bulle.hidden = false;
    const l = bulle.offsetWidth;
    const gauche = positions[i] + 10 + l > cadre.width ? positions[i] - l - 10 : positions[i] + 10;
    bulle.style.left = `${Math.max(0, gauche)}px`;
  });
  capteur.addEventListener("pointerleave", masquer);
}

/* Barres annuelles avec segments horizontaux ou trajectoire : une seule échelle, en hectares. */
function barresFlux(parent, o) {
  return graphique(parent, o.aria, (boite, largeur, aria) => {
    const hauteur = o.hauteur || 260;
    const zone = { gauche: 40, droite: largeur - 6, haut: 16, bas: hauteur - 24 };
    const valeurs = o.annees.map((a) => o.valeur(a)).filter((v) => v !== null);
    const lignes = o.lignes || [];
    const points = lignes.flatMap((l) => l.points.map((p) => p[1]));
    const brutMin = Math.min(0, ...valeurs, ...points);
    const ymin = brutMin * 1.2, ymax = Math.max(...valeurs, ...points, 1) * 1.08;  // de la place pour l'étiquette d'une barre négative
    const axe = reperes(ymin, ymax);
    const y = lineaire(Math.min(ymin, axe.valeurs[0]), Math.max(ymax, axe.valeurs.at(-1)), zone.bas, zone.haut);
    const pasX = (zone.droite - zone.gauche) / o.annees.length;
    const cx = (a) => zone.gauche + (o.annees.indexOf(a) + 0.5) * pasX;
    const larg = Math.min(26, Math.max(2, pasX - 2));
    const svg = creerSvg(boite, largeur, hauteur, aria);
    const idMotif = `hachure-${Math.random().toString(36).slice(2, 8)}`;
    svg.append(s("defs", null, s("pattern", { id: idMotif, width: 4, height: 4, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" },
      s("rect", { width: 4, height: 4, fill: "var(--bati-clair)" }), s("line", { x1: 0, y1: 0, x2: 0, y2: 4, stroke: "var(--bati)", "stroke-width": 2 }))));
    for (const v of axe.valeurs) {
      if (v !== 0) svg.append(s("line", { class: "grille-trait", x1: zone.gauche, x2: zone.droite, y1: y(v), y2: y(v) }));
      svg.append(s("text", { x: zone.gauche - 6, y: y(v) + 4, "text-anchor": "end" }, nombre(v, axe.pas < 1 ? 1 : 0)));
    }
    const espace = largeur < 460 ? (o.annees.length > 20 ? 10 : 4) : (o.annees.length > 20 ? 5 : 2);
    o.annees.forEach((a) => {
      if ((o.annees.length > 20 ? a : a - o.annees[0]) % espace === 0)
        svg.append(s("text", { x: cx(a), y: hauteur - 6, "text-anchor": "middle" }, String(a)));
    });
    for (const a of o.annees) {
      const v = o.valeur(a);
      if (v === null) continue;
      const nature = o.nature ? o.nature(a) : "";
      const y0 = y(0), y1 = y(v), x = cx(a) - larg / 2;
      const barre = s("rect", { x, y: Math.min(y0, y1), width: larg, height: Math.abs(y1 - y0), class: `barre ${nature === "saut" ? "saut" : ""}` });
      if (nature === "provisoire") barre.setAttribute("style", `fill:url(#${idMotif})`);
      svg.append(barre);
      if (nature === "saut" && largeur > 340)
        svg.append(s("text", { class: "etiquette", x: cx(a), y: v >= 0 ? y1 - 5 : y1 + 13, "text-anchor": "middle" }, signe(v)));
      const corrige = o.corrige ? o.corrige(a) : null;
      if (corrige !== null && corrige !== undefined)
        svg.append(s("line", { class: "corrige", x1: x - 2, x2: x + larg + 2, y1: y(corrige), y2: y(corrige) }));
    }
    svg.append(s("line", { class: "base", x1: zone.gauche, x2: zone.droite, y1: y(0), y2: y(0) }));
    for (const l of lignes) {
      svg.append(s("polyline", { class: `ligne ${l.classe}`, points: l.points.map(([a, v]) => `${cx(a)},${y(v)}`).join(" ") }));
      if (l.etiquette && largeur > 420) {
        const [a, v] = l.points[Math.floor(l.points.length * 0.45)];
        svg.append(s("text", { class: "etiquette", x: cx(a) + 6, y: y(v) - 8 }, l.etiquette));
      }
    }
    activerSurvol(boite, svg, zone, o.annees.map(cx), (i) => o.bulle(o.annees[i]));
  });
}

function courbeParts(parent, o) {
  return graphique(parent, o.aria, (boite, largeur, aria) => {
    const hauteur = 230;
    const zone = { gauche: 40, droite: largeur - 10, haut: 16, bas: hauteur - 24 };
    const series = o.series;
    const toutes = series.flatMap((c) => c.points.map((p) => p[1]));
    const axe = reperes(Math.min(...toutes) - 0.3, Math.max(...toutes) + 0.3);
    const d0 = Math.min(axe.valeurs[0], Math.min(...toutes)), d1 = Math.max(axe.valeurs.at(-1), Math.max(...toutes));
    const annees = series.flatMap((c) => c.points.map((p) => p[0]));
    const a0 = Math.min(...annees), a1 = Math.max(...annees);
    const x = lineaire(a0, a1, zone.gauche, zone.droite), y = lineaire(d0, d1, zone.bas, zone.haut);
    const svg = creerSvg(boite, largeur, hauteur, aria);
    for (const v of axe.valeurs) {
      svg.append(s("line", { class: "grille-trait", x1: zone.gauche, x2: zone.droite, y1: y(v), y2: y(v) }));
      svg.append(s("text", { x: zone.gauche - 6, y: y(v) + 4, "text-anchor": "end" }, `${nombre(v, axe.pas < 1 ? 1 : 0)}`));
    }
    const pas = largeur < 460 ? 8 : 4;
    for (let a = a0; a <= a1; a++) if ((a - a0) % pas === 0) svg.append(s("text", { x: x(a), y: hauteur - 6, "text-anchor": "middle" }, String(a)));
    for (const c of series) {
      svg.append(s("polyline", { class: `ligne ${c.classe}`, points: c.points.map(([a, v]) => `${x(a)},${y(v)}`).join(" ") }));
      const [a, v] = c.points.at(-1);
      svg.append(s("circle", { cx: x(a), cy: y(v), r: 4, fill: c.couleur, stroke: "var(--papier)", "stroke-width": 2 }));
    }
    const liste = []; for (let a = a0; a <= a1; a++) liste.push(a);
    activerSurvol(boite, svg, zone, liste.map(x), (i) => {
      const a = liste[i];
      return [h("strong", null, tr`1er janvier ${a}`), ...series.map((c) => {
        const p = c.points.find((q) => q[0] === a);
        return p ? h("span", null, tr`${c.nom} : ${nombre(p[1], 1)} %`) : null;
      }).filter(Boolean)];
    });
  });
}

const legende = (lignes) => h("ul", { class: "legende" }, lignes.map(([cle, couleur, texte]) => h("li", null,
  cle === "trait" ? h("i", { class: "trait", style: `border-top:2px ${couleur}` }) :
  cle === "hachure" ? h("i", { class: "hachure" }) : h("i", { style: `background:${couleur}` }), texte)));

function tableChiffres(titre, entetes, rangees) {
  return h("details", { class: "chiffres" }, h("summary", null, titre),
    h("div", { class: "defile" }, tableSimple(entetes, rangees)));
}
function tableSimple(entetes, rangees, colonnesTexte = []) {
  const classe = (i) => (colonnesTexte.includes(i) ? "texte" : null);
  return h("table", null,
    h("thead", null, h("tr", null, entetes.map((e, i) => h("th", { scope: "col", class: classe(i) }, e)))),
    h("tbody", null, rangees.map((r) => h("tr", null, r.map((v, i) => i === 0 ? h("th", { scope: "row" }, v) : h("td", { class: classe(i) }, v))))));
}
/* Cinq segments, pleins selon la classe de la valeur. Le chiffre reste à côté : les tirets ne portent pas seuls l'information. */
function tirets(classe) {
  const e = h("span", { class: "tirets", "aria-hidden": "true" });
  for (let i = 0; i < 5; i++) e.append(h("b", { class: i <= classe ? "plein" : null }));
  return e;
}

/* ---------- Bassins ---------- */
function trajectoire(R, a) { return R * Math.max(etat.meta.trajectoire_fin - a, 0) / (etat.meta.trajectoire_fin - etat.meta.trajectoire_debut); }

function graphiqueTrajectoire(parent, b, hauteur) {
  const { annees_flux: flux, trajectoire_debut: debut, trajectoire_fin: fin, derniere_annee_flux: der } = etat.meta;
  const annees = []; for (let a = flux[0]; a <= fin; a++) annees.push(a);
  const pts = []; for (let a = debut; a <= fin; a++) pts.push([a, trajectoire(b.reference, a)]);
  const refs = []; for (let a = flux[0]; a <= debut; a++) refs.push([a, b.reference]);
  const val = (a) => { const i = flux.indexOf(a); return i >= 0 ? b.flux[i] : null; };
  return barresFlux(parent, {
    annees, valeur: val, hauteur,
    nature: (a) => (a === der ? "provisoire" : ""),
    lignes: [{ classe: "ref", points: refs }, { classe: "traj", points: pts, etiquette: tr("Trajectoire du SDT") }],
    aria: tr`Terres artificialisées chaque année dans ${nomZone(b)}, comparées à la trajectoire du SDT qui descend de ${nombre(b.reference)} hectares par an à zéro en ${fin}.`,
    bulle: (a) => [h("strong", null, String(a)),
      val(a) !== null ? h("span", null, tr`Observé : ${ha(val(a))} ha${a === der ? tr(" (provisoire)") : ""}`) : null,
      a >= debut ? h("span", null, tr`Trajectoire : ${ha(trajectoire(b.reference, a))} ha`) : h("span", null, tr`Référence : ${ha(b.reference)} ha/an`)].filter(Boolean),
  });
}
function legendeTrajectoire(der) {
  return legende([["barre", "var(--bati)", tr("Terres artificialisées (solde net)")], ["hachure", "", tr`${der}, provisoire`],
    ["trait", "solid var(--traj)", tr("Trajectoire du SDT")], ["trait", "dotted var(--traj)", tr("Référence avant 2021")]]);
}

function tableBassins(complet) {
  const [a0, a1] = anneesBilan();
  const liste = (complet ? [etat.wallonie] : []).concat(etat.bassins);
  const max = Math.max(1.6, ...etat.bassins.map((b) => b.ratio * 1.05));
  const entetes = [tr("Bassin"), tr`Cumul ${a0}-${a1} / trajectoire`, tr("Part"), tr("Situation")]
    .concat(complet ? [tr("Observé (ha)"), tr("Trajectoire (ha)")] : []);
  return h("div", { class: "defile" }, h("table", null,
    h("thead", null, h("tr", null, entetes.map((t, i) => h("th", { scope: "col", class: i === 1 || i === 3 ? "texte" : null }, t)))),
    h("tbody", null, liste.map((b) => h("tr", { "data-bassin": b.cle },
      h("th", { scope: "row" }, b.cle === "wallonie" ? nomZone(b) : h("a", { href: `#bassin-${b.cle}` }, b.nom)),
      h("td", { class: "texte" }, h("div", { class: "jauge", role: "img", "aria-label": tr`${nombre(b.ratio * 100)} % du cumul de la trajectoire` },
        h("div", { class: "jauge-barre", style: `width:${Math.max(b.ratio, 0) / max * 100}%` }),
        h("div", { class: "jauge-limite", style: `left:${100 / max}%` }))),
      h("td", null, tr`${nombre(b.ratio * 100)} %`),
      h("td", { class: "texte" }, marqueSituation(b)),
      complet ? [h("td", null, nombre(b.cumul_observe_confirme)), h("td", null, nombre(b.cumul_autorise_confirme))] : null)))));
}

/* ---------- Carte et filtres ---------- */
let MESURES;
function textesMesures() {
MESURES = {
  part: {
    nom: tr("Part artificialisée"), valeur: (c) => c.part, seuils: [5, 10, 20, 35], prefixe: "seq",
    classes: [tr("moins de 5 %"), tr("5 à 10 %"), tr("10 à 20 %"), tr("20 à 35 %"), tr("plus de 35 %")],
    aide: () => tr`Part du territoire communal au 1er janvier ${etat.meta.stats.annee_stock}.`,
  },
  rythme: {
    nom: tr("Rythme récent"), valeur: (c) => c.rythme, seuils: [2, 5, 10, 20], prefixe: "seq",
    classes: [tr("moins de 2 ha/an"), tr("2 à 5"), tr("5 à 10"), tr("10 à 20"), tr("plus de 20 ha/an")],
    aide: () => tr`Hectares artificialisés par an en moyenne, ${etat.meta.stats.recent.join("-")}. Une grande commune a mécaniquement plus de surface à construire.`,
  },
  ecart: {
    nom: tr("Évolution du rythme"), valeur: (c) => c.ecart, seuils: [-5, -1, 1, 5], prefixe: "div",
    classes: [tr("ralentit de plus de 5 ha/an"), tr("ralentit de 1 à 5"), tr("stable, à 1 ha/an près"), tr("accélère de 1 à 5"), tr("accélère de plus de 5 ha/an")],
    aide: () => tr`Rythme ${etat.meta.stats.recent.join("-")} comparé à ${etat.meta.stats.passe.join("-")}. Une variation peut venir d'un reclassement au cadastre.`,
  },
};
}
const classeDe = (m, v) => { let i = 0; while (i < m.seuils.length && v >= m.seuils[i]) i++; return i; };
const dansFiltre = (c) => !etat.filtreBassin || (etat.filtreBassin === "hors" ? !c.bassin : c.bassin_cle === etat.filtreBassin);

function ongletsBassins(appliquer) {
  const choix = [["", tr("Tous")], ...etat.bassins.map((b) => [b.cle, b.nom]), ["hors", tr("Hors SDT")]];
  const barre = h("div", { class: "onglets", role: "group", "aria-label": tr("Filtrer par bassin") });
  const marquer = () => barre.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.cle === etat.filtreBassin));
  choix.forEach(([cle, t]) => barre.append(h("button", { type: "button", "data-cle": cle, onclick: () => { etat.filtreBassin = cle; marquer(); appliquer(); } }, t)));
  marquer();
  return barre;
}
function filtre(id, titre, options, valeur, change) {
  const select = h("select", { id, onchange: (e) => change(e.target.value) }, options.map(([v, t]) => h("option", { value: v, selected: v === valeur }, t)));
  return h("label", { class: "filtre", for: id }, titre, select);
}

function encartCommune(c) {
  if (!c) {
    const r = etat.meta.region;
    return h("div", { class: "encart" }, h("h3", null, tr("Wallonie entière")),
      h("dl", null, h("dt", null, tr("Part artificialisée")), h("dd", null, tr`${nombre(r.part, 1)} %`),
        h("dt", null, tr`Flux en ${etat.meta.derniere_annee_flux}, provisoire`), h("dd", null, `${nombre(r.flux.at(-1))} ha`)),
      h("p", { class: "note" }, tr("Survolez ou touchez une commune pour voir ses chiffres, ou cherchez-la par son nom.")));
  }
  return h("div", { class: "encart" }, h("h3", null, c.nom),
    h("dl", null, h("dt", null, tr("Part artificialisée")), h("dd", null, tr`${nombre(c.part, 1)} %`),
      h("dt", null, tr("Rythme récent")), h("dd", null, tr`${nombre(c.rythme, 1)} ha/an`),
      h("dt", null, tr`Écart avec ${etat.meta.stats.passe.join("-")}`), h("dd", null, tr`${signe(c.ecart, 1)} ha/an`),
      h("dt", null, tr("Bassin")), h("dd", null, c.bassin || tr("Aucun"))),
    c.saut ? h("p", { class: "note" }, tr("Variation à vérifier sur cette commune.")) : null,
    h("a", { class: "lien-fort", href: `#commune-${c.code}` }, tr("Voir la fiche")));
}

function sectionCarte() {
  const m = etat.meta, vueGeo = m.vue;
  const svg = s("svg", { viewBox: `0 0 ${vueGeo.largeur} ${vueGeo.hauteur}`, role: "img", "aria-label": tr("Carte des communes wallonnes. La liste complète se trouve dans la page Communes.") });
  const groupe = s("g");
  for (const c of etat.communes) {
    const p = s("path", { class: "commune", d: c.chemin, "data-code": c.code });
    p.append(s("title", null, c.nom));
    groupe.append(p);
  }
  const survol = s("path", { class: "survol" });
  svg.append(groupe, s("path", { class: "frontieres", d: m.frontieres_bassins }), survol);

  const encart = h("div", null, encartCommune(null));
  const zoneLegende = h("div");
  const aide = h("p", { class: "note" });
  const appliquer = () => {
    const me = MESURES[etat.mesure];
    groupe.querySelectorAll("path").forEach((p) => {
      const c = etat.parCode.get(Number(p.dataset.code));
      p.style.fill = `var(--${me.prefixe}-${classeDe(me, me.valeur(c))})`;
      p.classList.toggle("eteinte", !dansFiltre(c));
    });
    zoneLegende.replaceChildren(legende(me.classes.map((t, i) => ["barre", `var(--${me.prefixe}-${i})`, t])));
    aide.textContent = insecables(me.aide());
  };

  let tactile = false;
  const montrer = (code) => {
    const c = etat.parCode.get(code);
    survol.setAttribute("d", c.chemin);
    encart.replaceChildren(encartCommune(c));
  };
  svg.addEventListener("pointerdown", (e) => { tactile = e.pointerType !== "mouse"; });
  svg.addEventListener("pointermove", (e) => { const code = e.target.dataset && e.target.dataset.code; if (code) montrer(Number(code)); });
  svg.addEventListener("pointerleave", () => { if (!tactile) { survol.setAttribute("d", ""); } });
  svg.addEventListener("click", (e) => {
    const code = e.target.dataset && e.target.dataset.code;
    if (!code) return;
    montrer(Number(code));
    if (!tactile) location.hash = `commune-${code}`;
  });

  const metres = vueGeo.metres_par_unite;
  const kmDebut = Math.ceil(vueGeo.lambert_xmin / 50000) * 50;
  const reps = h("div", { class: "reperes", "aria-hidden": "true" });
  for (let km = kmDebut; (km * 1000 - vueGeo.lambert_xmin) / metres < vueGeo.largeur; km += 50) {
    const pos = ((km * 1000 - vueGeo.lambert_xmin) / metres) / vueGeo.largeur * 100;
    reps.append(h("span", { style: `left:${pos}%` }, `${km} km`));
  }
  const barre20 = (20000 / metres) / vueGeo.largeur * 100;
  const cadre = h("div", { class: "carte-cadre" }, svg, reps);
  cadre.append(h("div", { class: "echelle", "aria-hidden": "true", style: `width:${barre20}%` }, h("span", null, "20 km")));

  const section = h("section", { class: "section", "aria-labelledby": "titre-carte" },
    h("h2", { id: "titre-carte" }, tr("La carte des 261 communes")),
    h("div", { class: "filtres" }, filtre("mesure", tr("Mesure"), Object.entries(MESURES).map(([k, me]) => [k, me.nom]), etat.mesure, (v) => { etat.mesure = v; appliquer(); }), aide),
    ongletsBassins(appliquer),
    h("div", { class: "carte-zone" }, cadre, encart),
    zoneLegende,
    h("p", { class: "note" }, tr("Traits épais : limites des bassins du SDT. Repères : coordonnées est-ouest en Lambert belge 72. "), h("a", { href: "#communes" }, tr("Voir toutes les communes dans un tableau")), "."));
  appliquer();
  return section;
}

/* ---------- Pages ---------- */
function pageAccueil() {
  const w = etat.wallonie, m = etat.meta, der = m.derniere_annee_flux;
  const fluxDer = w.flux.at(-1);
  const graph = h("section", { class: "section" }, h("h2", null, tr("La Wallonie face à sa trajectoire")));
  graphiqueTrajectoire(graph, w, 320);
  graph.append(legendeTrajectoire(der));
  graph.append(h("p", { class: "note" }, tr("Wallonie hors Communauté germanophone, où le SDT ne s'applique pas. Estimation à partir des natures cadastrales du SPF Finances.")));
  return [grille({
    classe: "ouverture",
    tete: [h("p", { class: "fil" }, tr`Bilan ${anneesBilan()[0]}-${anneesBilan()[1]}`),
      h("h1", null, tr`De ${anneesBilan()[0]} à ${anneesBilan()[1]}, la Wallonie a artificialisé ${nombre(w.cumul_observe_confirme)} ha. Sa trajectoire en prévoyait ${nombre(w.cumul_autorise_confirme)}.`),
      constatBassin(w), h("p", { class: "chapeau" }, ecartBilan(w), " ", tr`${der} n'est pas compté : ses chiffres sont encore provisoires.`, " ", h("a", { href: "#methode" }, tr("Pourquoi")), ".")],
    corps: graph,
    haut: h("dl", { class: "tuiles" },
      tuile(tr`Artificialisés en ${der}`, `${nombre(fluxDer)} ha`, tr`Provisoire. Trajectoire : ${nombre(w.plafond_derniere_annee)} ha.`),
      tuile(tr("Par jour"), `${nombre(fluxDer / 365, 1)} ha`, tr`En ${der}, solde net.`),
      tuile(tr("Du territoire artificialisé"), tr`${nombre(m.region.part, 1)} %`, tr`Au 1er janvier ${m.stats.annee_stock}.`)),
  }),
  sectionCarte(),
  h("section", { class: "section", "aria-labelledby": "titre-bassins" },
    h("h2", { id: "titre-bassins" }, tr("Le SDT fixe la trajectoire par bassin")),
    h("p", { class: "note" }, tr`La barre montre le cumul ${anneesBilan()[0]}-${anneesBilan()[1]} par rapport à la trajectoire, repérée par le trait de couleur. Au-delà du trait, le bassin est au-dessus de sa trajectoire. `, h("a", { href: "#bassins" }, tr("Le détail par bassin")), "."),
    tableBassins(false))];
}

function pageBassins() {
  const m = etat.meta, der = m.derniere_annee_flux, w = etat.wallonie;
  const graph = h("div", { class: "section" }, h("h2", null, tr("L'ensemble de la Wallonie")));
  graphiqueTrajectoire(graph, w, 300);
  graph.append(legendeTrajectoire(der));
  return [h("section", { class: "section" },
    h("p", { class: "fil" }, tr("Schéma de développement du territoire 2024")),
    h("h1", null, tr("Les sept bassins face à leur trajectoire")),
    h("p", { class: "chapeau" }, tr`Le SDT 2024 fixe pour chaque bassin une baisse régulière, de la moyenne des dix ans de référence jusqu'à zéro en ${m.trajectoire_fin}. Le cumul ${anneesBilan()[0]}-${anneesBilan()[1]} permet de voir où chacun en est.`),
    tableBassins(true),
    h("p", { class: "note" }, tr`Le cumul ne compte que les années définitives : ${der}, encore provisoire, est visible sur le graphique mais pas compté. « Proche » signifie à moins de ${prochePct()} % du cumul prévu par la trajectoire. `, h("a", { href: "#methode" }, tr("Pourquoi ces choix")), ".")),
    graph];
}

function pageBassin(cle) {
  const b = etat.bassins.find((x) => x.cle === cle);
  if (!b) return pageIntrouvable();
  const m = etat.meta, der = m.derniere_annee_flux;
  const graph = h("section", { class: "section" }, h("h2", null, tr("Le bassin face à sa trajectoire")));
  graphiqueTrajectoire(graph, b, 320);
  graph.append(legendeTrajectoire(der));
  const mq = b.marquante, nomMq = etat.parCode.get(mq.code);
  const notes = [h("p", { class: "note" }, tr`En ${der}, la commune qui pèse le plus sur le flux du bassin est `, h("a", { href: `#commune-${mq.code}` }, nomMq.nom), ` (${signe(mq.valeur, 1)} ha).`)];
  if (b.cle === "liege-1") notes.push(h("p", { class: "note" }, tr("Pour ce bassin, le graphique du SDT et la note de la CPDT de décembre 2025 ne donnent pas la même référence. Le constat dépend donc davantage de la valeur retenue.")));
  graph.append(...notes);
  return [grille({
    tete: [h("p", { class: "fil" }, tr`${b.communes.length} communes`), h("h1", null, tr`Bassin ${b.nom}`), constatBassin(b),
      h("p", { class: "chapeau" }, tr`De ${anneesBilan()[0]} à ${anneesBilan()[1]}, le bassin a artificialisé ${nombre(b.cumul_observe_confirme)} ha. Sa trajectoire en prévoyait ${nombre(b.cumul_autorise_confirme)}.`, " ", ecartBilan(b))],
    corps: graph,
    haut: h("dl", { class: "tuiles" },
      tuile(tr("Observé"), `${nombre(b.cumul_observe_confirme)} ha`, tr`Cumul ${anneesBilan()[0]}-${anneesBilan()[1]}.`),
      tuile(tr("Trajectoire"), `${nombre(b.cumul_autorise_confirme)} ha`, tr`Cumul ${anneesBilan()[0]}-${anneesBilan()[1]}.`),
      tuile(tr("Référence"), tr`${ha(b.reference)} ha/an`, tr`Lue sur le graphique du SDT, à ${nombre(b.incertitude, 1)} ha/an près.`),
      tuile(tr`En ${der}`, `${ha(b.flux.at(-1))} ha`, tr`Provisoire, non compté. Trajectoire : ${ha(b.plafond_derniere_annee)} ha.`)),
  }), sectionCommunesBassin(b)];
}

function sectionCommunesBassin(b) {
  const m = etat.meta;
  const colonnes = [["nom", tr("Commune")], ["part", tr`Part ${m.stats.annee_stock}`], ["rythme", tr("Rythme récent (ha/an)")], ["cumul", tr`Cumul ${m.stats.recent.join("-")} (ha)`]];
  const corps = h("tbody");
  const tete = h("tr");
  const remplir = () => {
    const { cle, sens } = etat.tri;
    const lignes = [...b.communes].sort((x, y) => (cle === "nom" ? sansAccent(x.nom).localeCompare(sansAccent(y.nom)) : x[cle] - y[cle]) * sens);
    corps.replaceChildren(...lignes.map((c) => h("tr", null,
      h("th", { scope: "row" }, h("a", { href: `#commune-${c.code}` }, c.nom), c.saut ? h("span", { class: "marque-signal" }, " *") : null),
      h("td", null, tirets(classeDe(MESURES.part, c.part)), h("span", { class: "valeur" }, tr`${nombre(c.part, 1)} %`)), h("td", null, nombre(c.rythme, 1)), h("td", null, nombre(c.cumul, 1)))));
    tete.querySelectorAll("th").forEach((th) => th.setAttribute("aria-sort", th.dataset.cle === cle ? (sens > 0 ? "ascending" : "descending") : "none"));
  };
  colonnes.forEach(([cle, t]) => tete.append(h("th", { scope: "col", "data-cle": cle }, h("button", { type: "button", onclick: () => {
    etat.tri = { cle, sens: etat.tri.cle === cle ? -etat.tri.sens : 1 };
    remplir();
  } }, t))));
  etat.tri = { cle: "nom", sens: 1 };
  remplir();
  return h("section", { class: "section" }, h("h2", null, tr("Les communes du bassin")),
    h("p", { class: "note" }, tr("Ce tableau n'est pas un classement : la trajectoire ne fixe rien par commune. Une grande commune peut construire plus sans s'écarter de son rythme passé.")),
    h("div", { class: "defile" }, h("table", null, h("thead", null, tete), corps)),
    h("p", { class: "note" }, tr("* Variation à vérifier sur la fiche de la commune.")));
}

function pageCommunes() {
  const m = etat.meta;
  const crit = { signal: "", verif: "" };
  const colonnes = [["nom", tr("Commune"), "texte"], ["bassin", tr("Bassin"), "texte"], ["part", tr`Part ${m.stats.annee_stock}`], ["rythme", tr("Récent")], ["ecart", tr`Écart avec ${m.stats.passe.join("-")}`], ["signal", tr("Constat"), "texte"]];
  const corps = h("tbody");
  const tete = h("tr");
  const compte = h("p", { class: "compte", role: "status" });
  etat.tri = { cle: "nom", sens: 1 };
  const remplir = () => {
    const { cle, sens } = etat.tri;
    const texteDe = (c) => sansAccent(cle === "nom" ? c.nom : cle === "bassin" ? c.bassin || "zzz" : c.signal);
    const lignes = etat.communes.filter((c) => dansFiltre(c) && (!crit.signal || c.signal === crit.signal) && (!crit.verif || c.saut))
      .sort((x, y) => (["nom", "bassin", "signal"].includes(cle) ? texteDe(x).localeCompare(texteDe(y)) : x[cle] - y[cle]) * sens);
    corps.replaceChildren(...lignes.map((c) => h("tr", null,
      h("th", { scope: "row" }, h("a", { href: `#commune-${c.code}` }, c.nom), c.saut ? h("span", { class: "marque-signal" }, " *") : null),
      h("td", { class: "texte" }, c.bassin || tr("Hors SDT")),
      h("td", null, tirets(classeDe(MESURES.part, c.part)), h("span", { class: "valeur" }, tr`${nombre(c.part, 1)} %`)),
      h("td", null, nombre(c.rythme, 1)), h("td", null, signe(c.ecart, 1)),
      h("td", { class: "texte" }, marqueSignal(c.signal, true)))));
    compte.textContent = enAnglais() ? `${lignes.length} of ${etat.communes.length} municipalities` : `${lignes.length} ${pluriel(lignes.length, "commune", "communes")} sur ${etat.communes.length}`;
    tete.querySelectorAll("th").forEach((th) => th.setAttribute("aria-sort", th.dataset.cle === cle ? (sens > 0 ? "ascending" : "descending") : "none"));
  };
  colonnes.forEach(([cle, t, classe]) => tete.append(h("th", { scope: "col", "data-cle": cle, class: classe || null }, h("button", { type: "button", onclick: () => {
    etat.tri = { cle, sens: etat.tri.cle === cle ? -etat.tri.sens : 1 };
    remplir();
  } }, t))));
  remplir();
  return [h("section", { class: "section" },
    h("p", { class: "fil" }, tr("Tableau")),
    h("h1", null, tr("Toutes les communes")),
    h("p", { class: "chapeau" }, tr("Chaque commune est comparée à son propre passé. Ce tableau n'est pas un classement : la trajectoire du SDT ne fixe rien par commune.")),
    h("div", { class: "filtres" },
      filtre("f-signal", tr("Constat"), [["", tr("Tous")], ...Object.entries(SIGNAUX).map(([k, v]) => [k, v[3]])], "", (v) => { crit.signal = v; remplir(); }),
      filtre("f-verif", tr("Variations"), [["", tr("Toutes les communes")], ["oui", tr("Avec variation à vérifier")]], "", (v) => { crit.verif = v; remplir(); })),
    ongletsBassins(remplir),
    compte,
    h("div", { class: "defile" }, h("table", null,
      h("thead", null, h("tr", { class: "groupes" }, h("th", { colspan: 2 }), h("th", null, tr("Occupation")), h("th", { colspan: 2, scope: "colgroup" }, tr("Rythme (ha/an)")), h("th")), tete), corps)),
    h("p", { class: "note" }, tr`* Variation à vérifier sur la fiche de la commune. Rythme récent : moyenne ${m.stats.recent.join("-")}, dont ${m.derniere_annee_flux} provisoire.`))];
}

/* Une requête peut rester en suspens ou être coupée : on la relance une fois plutôt que d'attendre sans fin. */
async function lireJson(url) {
  for (const delai of [8000, 30000]) {
    const arret = new AbortController();
    const minuterie = setTimeout(() => arret.abort(), delai);
    try {
      const r = await fetch(url, { signal: arret.signal });
      if (!r.ok) throw new Error(`${url} : ${r.status}`);
      return await r.json();
    } catch (err) {
      if (delai === 30000) throw err;
    } finally {
      clearTimeout(minuterie);
    }
  }
}

async function chargerCommune(code) {
  const paquet = Math.floor(code / 1000);
  if (!etat.paquets.has(paquet)) etat.paquets.set(paquet, await lireJson(`data/communes/${paquet}.json`));
  return etat.paquets.get(paquet)[String(code)];
}

let GROUPES;
function textesGroupes() {
GROUPES = [
  [tr("Résidentiel"), ["resid"], "var(--bati)"],
  [tr("Autres terrains artificialisés"), ["comm", "equip", "loisirs", "agri_bat", "indus", "carrieres", "transport", "autres_art"], "var(--bati-clair)"],
  [tr("Agricole"), ["arable", "herbe"], "var(--agri)"],
  [tr("Forêts et milieux naturels"), ["foret", "seminat", "humide", "eau"], "var(--foret)"],
  [tr("Inconnu, dont non cadastré"), ["inconnu"], "var(--inconnu)"],
];
}

function pageCommune(c, et, ph) {
  const m = etat.meta, der = m.stats.annee_stock, derFlux = m.derniere_annee_flux;
  const [r0, r1] = m.stats.recent, [p0, p1] = m.stats.passe;
  const dernier = (k) => c.parts_estimees[k].at(-1);
  const signal = c.phrases.find((p) => p.regle === "rythme").signal;

  const tete = [
    h("p", { class: "fil" }, c.bassin ? h("a", { href: `#bassin-${c.bassin_cle}` }, tr`Bassin ${c.bassin}`) : tr("Communauté germanophone, hors SDT"), ` · ${c.province}`),
    h("h1", null, c.nom),
    marqueSignal(signal)];

  const refMediane = c.mediane_bassin !== null ? [tr("Médiane du bassin"), c.mediane_bassin] : [tr("Médiane wallonne"), m.stats.mediane_wallonie];
  const tuiles = h("dl", { class: "tuiles" },
    tuile(tr("Territoire artificialisé"), tr`${nombre(c.part, 1)} %`, tr`Estimation, 1er janvier ${der}`),
    c.part_iweps !== null ? tuile(tr("Chiffre de l'IWEPS"), tr`${nombre(c.part_iweps, 1)} %`, tr`Dernier publié, 1er janvier ${m.stats.annee_iweps}`) : null,
    tuile(refMediane[0], tr`${nombre(refMediane[1], 1)} %`, tr`Estimation, 1er janvier ${der}`),
    tuile(tr("Rythme récent"), tr`${nombre(c.rythme_recent, 1)} ha/an`, tr`${r0}-${r1}, dont ${derFlux} provisoire`));

  const retenir = h("section", { class: "section" }, h("h2", null, tr("Ce qu'il faut retenir")),
    h("ul", { class: "retenir" }, c.phrases.map((p) => h("li", { class: p.regle === "saut" || p.regle === "reclassement" ? "alerte" : null }, texteP(p)))),
    c.phrases.some((p) => /\bpoints?\b/.test(p.texte)) ? h("p", { class: "note" }, tr("Ici, un point est un point de pourcentage du territoire de la commune.")) : null);

  const grouper = (k) => k.reduce((t, x) => t + dernier(x), 0);
  const groupes = GROUPES.map(([nom, cles, couleur]) => ({ nom, couleur, val: grouper(cles) }));
  const compo = h("section", { class: "section" }, h("h2", null, tr`À quoi sert le territoire en ${der}`),
    h("div", { class: "empile", role: "img", "aria-label": groupes.map((g) => tr`${g.nom} ${nombre(g.val, 1)} %`).join(", ") },
      groupes.map((g) => h("span", { style: `flex:${Math.max(g.val, 0.01)} 1 0;background:${g.couleur}`, title: tr`${g.nom} : ${nombre(g.val, 1)} %` }))),
    legende(groupes.map((g) => ["barre", g.couleur, tr`${g.nom} ${nombre(g.val, 1)} %`])),
    h("p", { class: "note" }, tr("La part « inconnu » regroupe surtout les voiries et les voies d'eau, qui n'ont pas de nature au cadastre.")),
    tableChiffres(tr("Voir les 16 catégories"), [tr("Catégorie"), tr`Estimation ${der} (%)`, tr`Hectares ${der}`, tr`IWEPS ${m.stats.annee_iweps} (%)`, tr`Écart depuis ${m.stats.premiere_annee} (points)`],
      [...m.artif, ...m.non_artif].map((k) => {
        const serie = c.parts_estimees[k];
        const iw = c.parts_iweps ? c.parts_iweps[k].at(-1) : null;
        return [(enAnglais() ? m.libelles_en : m.libelles)[k], nombre(serie.at(-1), 1), ha(c.ha_estimes[k]), iw === null ? tr("n.d.") : nombre(iw, 1), signe(c.hausses[k], 1)];
      })));

  const estim = m.annees_stock.map((a, i) => [a, c.parts_estimees.artif[i]]);
  const iwSerie = c.parts_iweps ? m.annees_iweps.map((a, i) => [a, c.parts_iweps.artif[i]]) : [];
  const evo = h("section", { class: "section" }, h("h2", null, tr("Comment la part artificialisée évolue")));
  courbeParts(evo, {
    aria: tr`Part artificialisée de ${c.nom} selon l'IWEPS jusqu'en ${m.stats.annee_iweps} et selon l'estimation du portail jusqu'en ${der}.`,
    series: [{ nom: "IWEPS", classe: "iweps", couleur: "var(--bati)", points: iwSerie }, { nom: tr("Estimation"), classe: "estim", couleur: "var(--encre)", points: estim }].filter((x) => x.points.length),
  });
  evo.append(legende([["trait", "solid var(--bati)", tr`IWEPS, publié, ${m.annees_iweps[0]}-${m.stats.annee_iweps}, arrondi à 0,1 point`], ["trait", "dashed var(--encre)", tr`Estimation du portail, ${m.annees_stock[0]}-${der}`]]));
  evo.append(h("p", { class: "note" }, tr("En % du territoire. L'axe ne commence pas à zéro, pour rendre l'évolution lisible.")));

  const annees = m.annees_flux;
  const sautsAnnees = new Set(c.sauts.map((x) => x[0]));
  const reclassParAn = new Map(c.reclassements.map((x) => [x.annee, x]));
  const seg = (classe, de, a, v) => { const points = []; for (let y = de; y <= a; y++) points.push([y, v]); return { classe, points }; };
  const lignes = [seg("passe", p0, p1, c.rythme_passe), seg("recent", r0, r1, c.rythme_recent)];
  const sautAvant = c.rythme_passe_sans_saut !== c.rythme_passe, sautApres = c.rythme_recent_sans_saut !== c.rythme_recent;
  if (sautAvant) lignes.push(seg("sans-saut", p0, p1, c.rythme_passe_sans_saut));
  if (sautApres) lignes.push(seg("sans-saut", r0, r1, c.rythme_recent_sans_saut));
  const fluxS = h("section", { class: "section" }, h("h2", null, tr("Terres artificialisées chaque année")),
    h("p", { class: "note" }, tr("Estimation du portail, en hectares. C'est un solde net : les terrains entrés moins les terrains sortis de la catégorie artificialisée.")));
  barresFlux(fluxS, {
    annees, valeur: (a) => c.flux[annees.indexOf(a)], lignes, hauteur: 250,
    nature: (a) => (sautsAnnees.has(a) || reclassParAn.has(a) ? "saut" : a === derFlux ? "provisoire" : ""),
    corrige: (a) => (reclassParAn.has(a) ? reclassParAn.get(a).corrige : null),
    aria: tr`Flux annuels de ${c.nom} de ${annees[0]} à ${derFlux}, en hectares.`,
    bulle: (a) => [h("strong", null, String(a)), h("span", null, `${signe(c.flux[annees.indexOf(a)], 1)} ha`),
      reclassParAn.has(a) ? h("span", null, tr`Reclassement probable. Sans ce mouvement : ${signe(reclassParAn.get(a).corrige, 1)} ha`) : null,
      sautsAnnees.has(a) ? h("span", null, tr("À vérifier")) : null, a === derFlux ? h("span", null, tr("Provisoire")) : null].filter(Boolean),
  });
  const entreesLegende = [["barre", "var(--bati)", tr("Flux annuel")], ["hachure", "", tr`${derFlux}, provisoire`]];
  if (c.sauts.length || c.reclassements.length) entreesLegende.push(["barre", "var(--saut)", tr("Variation à vérifier")]);
  if (c.reclassements.length) entreesLegende.push(["trait", "solid var(--encre)", tr("Trait court : flux sans le reclassement")]);
  entreesLegende.push(["trait", "dashed var(--encre-2)", tr`Moyenne ${p0}-${p1} : ${nombre(c.rythme_passe, 1)} ha/an`]);
  if (sautAvant) entreesLegende.push(["trait", "dotted var(--saut)", tr`${p0}-${p1} sans les variations : ${nombre(c.rythme_passe_sans_saut, 1)} ha/an`]);
  entreesLegende.push(["trait", "solid var(--encre)", tr`Moyenne ${r0}-${r1} : ${nombre(c.rythme_recent, 1)} ha/an`]);
  if (sautApres) entreesLegende.push(["trait", "dotted var(--saut)", tr`${r0}-${r1} sans les variations : ${nombre(c.rythme_recent_sans_saut, 1)} ha/an`]);
  fluxS.append(legende(entreesLegende));
  fluxS.append(tableChiffres(tr("Voir les chiffres"), [tr("Année"), tr("Flux net (ha)")], annees.map((a, i) => [String(a) + (a === derFlux ? tr(" (provisoire)") : "") + (reclassParAn.has(a) ? tr(" (reclassement probable)") : "") + (sautsAnnees.has(a) ? tr(" (à vérifier)") : ""), signe(c.flux[i], 2)])));

  const voisins = c.voisins.length ? h("section", { class: "section" }, h("h2", null, tr("Communes voisines")),
    h("div", { class: "defile" }, h("table", null,
      h("thead", null, h("tr", null, h("th", { scope: "col" }, tr("Commune")), h("th", { scope: "col" }, tr("Part")))),
      h("tbody", null, [...c.voisins].sort((x, y) => sansAccent(x.nom).localeCompare(sansAccent(y.nom))).map((v) => h("tr", null, h("th", { scope: "row" }, h("a", { href: `#commune-${v.code}` }, v.nom)), h("td", null, tr`${nombre(v.part, 1)} %`))))))) : null;
  return [grille({ tete, corps: [retenir, compo, evo, fluxS, et ? sectionEtalement(c, et, ph) : null], haut: tuiles, bas: voisins })];
}

/* ---------- Étalement vu du ciel (communes pilotes, WalOUS 2018-2023) ---------- */
let FAMILLES, AVANT_2018;
function textesEtalement() {
FAMILLES = {
  habitat: [tr("Zone d'habitat"), "var(--z-habitat)"],
  activite: [tr("Zone d'activité économique"), "var(--z-activite)"],
  equipement: [tr("Équipements et loisirs"), "var(--z-equipement)"],
  reserve: [tr("Réserve foncière (ZACC)"), "var(--z-reserve)"],
  agricole: [tr("Zone agricole"), "var(--z-agricole)"],
  forestiere: [tr("Zone forestière"), "var(--z-forestiere)"],
  naturelle: [tr("Espaces verts et naturels"), "var(--z-naturelle)"],
  extraction: [tr("Zone d'extraction"), "var(--z-extraction)"],
  autre: [tr("Autres zones"), "var(--z-autre)"],
  "hors plan": [tr("Hors plan de secteur"), "var(--z-autre)"],
};
AVANT_2018 = {
  herbe_permanente: tr("prairie, pelouse ou friche"), herbe_rotation: tr("culture"), feuillus_haut: tr("arbres feuillus"),
  feuillus_bas: tr("jeunes feuillus ou haies"), resineux_haut: tr("résineux"), resineux_bas: tr("jeunes résineux"),
  sol_nu: tr("sol nu"), eau: tr("eau"),
};
}
const pilotes = () => (etat.meta.etalement && etat.meta.etalement.communes) || [];
const ORDRE_ZONES = ["agricole", "forestiere", "naturelle", "equipement", "extraction", "autre", "reserve", "activite", "habitat"];

function barresZones(r) {
  const total = r.neuf_ha, sup = r.superficie_ha;
  const lignes = Object.entries(r.par_famille).map(([k, v]) => ({ k, neuf: (v.batiments_ha + v.abords_ha) / total * 100, terr: (r.territoire_par_famille_ha[k] || 0) / sup * 100 }))
    .filter((x) => x.neuf >= 0.5 || x.terr >= 5).sort((a, b) => b.neuf - a.neuf);
  const max = Math.max(...lignes.map((x) => Math.max(x.neuf, x.terr)));
  return h("dl", { class: "etal-barres" }, lignes.flatMap((x) => [
    h("dt", null, FAMILLES[x.k][0]),
    h("dd", null, h("div", { class: "piste", role: "img", "aria-label": tr`${nombre(x.neuf)} % du neuf, ${nombre(x.terr)} % du territoire` },
      h("span", { style: `width:${x.neuf / max * 100}%` }), h("b", { style: `left:calc(${x.terr / max * 100}% - 1px)` }))),
    h("dd", { class: "val" }, tr`${nombre(x.neuf)} %`)]));
}

/* Fin de chaque période de datation : une tache est « bâtie » sur la carte à partir de cette année. */
const FIN_PERIODE = [2019, 2020, 2023];
const PERIODES_TXT = () => [tr("entre 2018 et 2019"), tr("entre 2019 et 2020"), tr("entre 2020 et 2023")];
const ZOOM_PHOTOS_M = 5000;   // en dessous de cette largeur de vue, on montre les vues à 0,5 m des chantiers

/* Photos aériennes du SPW lues en direct (orthophotos annuelles, CC BY 4.0), par tuiles de 512 pixels calées sur la
   grille Lambert 72. Certains vols ne couvrent qu'une partie de la Wallonie : on superpose alors les vols de la même
   année (PNG transparent), et en dernier recours l'année « repli », que la mention de la carte cite. */
const ORTHO = "https://geoservices.wallonie.be/arcgis/rest/services/IMAGERIE/{}/MapServer/export";
const VOLS = {
  2018: { couches: [["ORTHO_2018", "jpg"]] }, 2019: { couches: [["ORTHO_2019", "jpg"]] },
  2020: { couches: [["ORTHO_2020", "jpg"]] }, 2021: { couches: [["ORTHO_2021", "jpg"]] },
  2022: { couches: [["ORTHO_2022_ETE", "png32"], ["ORTHO_2022_PRINTEMPS", "png32"], ["ORTHO_2021", "jpg"]], repli: 2021 },
  2023: { couches: [["ORTHO_2023_ETE", "jpg"]] },
  2024: { couches: [["ORTHO_2024", "png32"], ["ORTHO_2023_ETE", "jpg"]], repli: 2023 },
  2025: { couches: [["ORTHO_2025_ETE", "png32"], ["ORTHO_2025_PRINTEMPS", "jpg"]] },
  2026: { couches: [["ORTHO_2026_PRINTEMPS", "jpg"]] },
};
const TUILE_PX = 512, RESOLUTIONS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
const urlOrtho = (service, fmt, x0, y0, m, px = TUILE_PX) => `${ORTHO.replace("{}", service)}?bbox=${x0},${y0},${x0 + m},${y0 + m}&bboxSR=31370&imageSR=31370&size=${px},${px}&format=${fmt}${fmt === "png32" ? "&transparent=true" : ""}&f=image`;
/* Mémoire des photos : chaque tuile téléchargée est gardée (URL blob), pour revenir sur une année sans la recharger.
   Le serveur du SPW interdit au navigateur de garder ses images (max-age=0), d'où cette mémoire à nous. Quand la vue
   est rapprochée et immobile, on précharge les autres années, deux requêtes à la fois, pour ne pas charger le SPW. */
const MEMOIRE_MAX = 600, PRECHARGE_TUILES_MAX = 6, PRECHARGE_PARALLELE = 2;
const memoirePhotos = new Map();   // adresse -> promesse de l'URL blob (null si la lecture a échoué)
const photo = (url) => {
  if (memoirePhotos.has(url)) { const p = memoirePhotos.get(url); memoirePhotos.delete(url); memoirePhotos.set(url, p); return p; }
  const p = fetch(url, { credentials: "omit" })
    .then((r) => (r.ok && (r.headers.get("content-type") || "").startsWith("image/") ? r.blob() : null))
    .then((b) => (b ? URL.createObjectURL(b) : null), () => null);
  p.then((src) => { if (!src) memoirePhotos.delete(url); });   // un échec n'est pas gardé : on réessaiera
  memoirePhotos.set(url, p);
  for (const [u, vieille] of memoirePhotos) {   // les plus anciennes sortent en premier
    if (memoirePhotos.size <= MEMOIRE_MAX) break;
    memoirePhotos.delete(u); vieille.then((src) => src && URL.revokeObjectURL(src));
  }
  return p;
};
let filePrecharge = [], prechargesEnCours = 0;
const pomper = () => {
  while (prechargesEnCours < PRECHARGE_PARALLELE && filePrecharge.length) {
    const url = filePrecharge.shift();
    if (memoirePhotos.has(url)) continue;
    prechargesEnCours++;
    photo(url).finally(() => { prechargesEnCours--; pomper(); });
  }
};
const precharger = (urls) => { filePrecharge = urls; pomper(); };   // remplace la file : la vue a changé

/* Le site peut-il afficher les images du SPW ? Non dans un artifact (sa politique de sécurité bloque les images
   d'autres sites) : la carte se rabat alors sur les photos publiées avec le portail, ou sur le plan de secteur. */
let sondeOrtho = null;
const orthoDirecte = () => sondeOrtho || (sondeOrtho = new Promise((ok) => {
  const im = new Image(), fin = setTimeout(() => ok(false), 8000);
  im.onload = () => { clearTimeout(fin); ok(im.naturalWidth > 0); };
  im.onerror = () => { clearTimeout(fin); ok(false); };
  im.src = urlOrtho("ORTHO_2023_ETE", "jpg", 172000, 140000, 8, 2);
}));

function carteEtalement(et, ph) {
  const L = et.largeur, H = et.hauteur, code = et.code;
  const annees = ph ? (ph.annees || Object.keys(VOLS).map(Number)) : [2018, 2019, 2020, 2021, 2022, 2023];
  let annee = annees.at(-1), fond = ph ? "photo" : "plan";
  const svg = s("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", "aria-label": tr`Carte de ${et.nom} : nouveaux bâtiments et revêtements vus sur les photos aériennes de 2018 et 2023, sur le plan de secteur.` });
  const gFond = s("g"), gVues = s("g"), gZones = s("g"), gCentr = s("g"), gParc = s("g"), gTaches = s("g");
  for (const k of ORDRE_ZONES) if (et.zones[k]) gZones.append(s("path", { class: "etal-zone", d: et.zones[k], style: `fill:${FAMILLES[k][1]}` }));
  gCentr.append(s("path", { class: "etal-centr", d: et.centralites }));
  for (const p of Object.values(et.parcelles)) gParc.append(s("path", { class: "etal-parcelle", d: p.d }));
  const taches = et.taches.map((t, i) => s("path", { class: `etal-tache ${t.c}`, d: t.d, "data-i": i }));
  gTaches.append(...taches.filter((_, i) => et.taches[i].c !== "construction"), ...taches.filter((_, i) => et.taches[i].c === "construction"));   // les bâtiments par-dessus
  const choixParc = s("path", { class: "etal-choisie", "stroke-dasharray": "4 3", d: "" });
  const choix = s("path", { class: "etal-choisie", d: "" });
  const contour = s("path", { class: "etal-contour", d: et.contour });
  svg.append(gFond, gVues, gZones, contour, gParc, gCentr, gTaches, choixParc, choix);
  gParc.style.display = "none";

  /* Photos en direct : les tuiles de la vue courante, à la résolution du zoom. L'ancienne vue reste dessous tant que
     la nouvelle n'est pas chargée, pour éviter les trous pendant un zoom ou un changement d'année. */
  const direct = ph && ph.mode === "direct";
  const gAncien = s("g"), gCourant = s("g");
  if (direct) gFond.append(gAncien, gCourant);
  let cleCourante = "", minuteriePrecharge = null;
  const majDirect = () => {
    const c = svg.getBoundingClientRect(); if (!c.width) return;
    const mParPx = Math.max(vb.w / c.width, vb.h / c.height) / Math.min(window.devicePixelRatio || 1, 2);
    const res = RESOLUTIONS.find((r) => r >= mParPx) || RESOLUTIONS.at(-1), m = res * TUILE_PX;
    const ox = et.lambert_x0, oy = et.lambert_y0;
    const gx0 = Math.floor((ox + Math.max(vb.x, 0)) / m), gx1 = Math.floor((ox + Math.min(vb.x + vb.w, L)) / m);
    const gy0 = Math.floor((oy - Math.min(vb.y + vb.h, H)) / m), gy1 = Math.floor((oy - Math.max(vb.y, 0)) / m);
    const cle = `${annee}|${res}|${gx0}|${gx1}|${gy0}|${gy1}`;
    if (cle === cleCourante) return;
    const memeNiveau = cleCourante.startsWith(`${annee}|${res}|`);
    cleCourante = cle;
    if (!memeNiveau) { gAncien.replaceChildren(...gCourant.childNodes); gCourant.replaceChildren(); }
    const deja = new Set([...gCourant.children].map((g) => g.dataset.t));
    let attendues = 0;
    const charge = () => { if (--attendues <= 0) gAncien.replaceChildren(); };
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      if (deja.has(`${gx}|${gy}`)) continue;
      const g = s("g"); g.dataset.t = `${gx}|${gy}`;
      for (const [service, fmt] of [...VOLS[annee].couches].reverse()) {
        const im = s("image", { x: gx * m - ox, y: oy - (gy + 1) * m, width: m, height: m, preserveAspectRatio: "none" });
        attendues++; im.addEventListener("load", charge, { once: true }); im.addEventListener("error", charge, { once: true });
        const url = urlOrtho(service, fmt, gx * m, gy * m, m);
        im.dataset.src = url;   // l'adresse d'origine, l'image affichée venant de la mémoire (blob)
        photo(url).then((src) => im.setAttribute("href", src || url));
        g.append(im);
      }
      gCourant.append(g);
    }
    if (!attendues) gAncien.replaceChildren();
    /* Vue rapprochée : on précharge les mêmes tuiles pour les autres années, les plus proches d'abord */
    clearTimeout(minuteriePrecharge);
    const nbTuiles = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);
    if (nbTuiles <= PRECHARGE_TUILES_MAX) minuteriePrecharge = setTimeout(() => {
      const autres = annees.filter((a) => a !== annee && VOLS[a]).sort((a, b) => Math.abs(a - annee) - Math.abs(b - annee));
      const urls = [];
      for (const a of autres) for (const [service, fmt] of VOLS[a].couches)
        for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) urls.push(urlOrtho(service, fmt, gx * m, gy * m, m));
      precharger(urls);
    }, 600);
    const r = VOLS[annee].repli;
    credit.textContent = r ? tr`Photo aérienne : SPW, ${annee} (${r} là où le vol de ${annee} manque)` : tr`Photo aérienne : SPW, ${annee}`;
  };

  /* Photos publiées avec le portail : tuiles de fond à 2 m, puis vues à 0,5 m des chantiers, créées à la demande */
  const fichiers = ph && !direct;
  const fondDe = (a) => ph.fond.annees.reduce((m, x) => (Math.abs(x - a) < Math.abs(m - a) ? x : m));
  const tuilesFond = fichiers ? ph.fond.tuiles.map((t, i) => { const im = s("image", { x: t.x, y: t.y, width: t.l, height: t.h, preserveAspectRatio: "none" }); im.dataset.i = i; gFond.append(im); return im; }) : [];
  const vues = new Map();
  const majFond = () => direct ? majDirect() : tuilesFond.forEach((im) => im.setAttribute("href", `data/photos/${code}/fond_${fondDe(annee)}_${im.dataset.i}.jpg`));
  const majVues = () => {
    if (direct) { if (fond === "photo") majDirect(); return; }
    const proche = ph && fond === "photo" && vb.w <= ZOOM_PHOTOS_M;
    if (ph) credit.textContent = tr`Photo aérienne : SPW, ${fondDe(annee)}`;
    if (!proche) { gVues.style.display = "none"; return; }
    gVues.style.display = "";
    let vues_ok = 0, vues_manquantes = 0;
    ph.vues.forEach((v, i) => {
      const visible = v.x < vb.x + vb.w && v.x + v.l > vb.x && v.y < vb.y + vb.h && v.y + v.h > vb.y;
      if (!visible && !vues.has(i)) return;
      if (!vues.has(i)) {
        const im = s("image", { width: 2048, height: ph.hauteurs_planches[v.p], preserveAspectRatio: "none" });
        const cadreVue = s("svg", { x: v.x, y: v.y, width: v.l, height: v.h, viewBox: `${v.px} ${v.py} ${v.pw} ${v.ph}`, preserveAspectRatio: "none" }, im);
        gVues.append(cadreVue);
        vues.set(i, [cadreVue, im]);
      }
      const [cadreVue, im] = vues.get(i), manque = (ph.manquantes[annee] || []).includes(i);
      cadreVue.style.display = manque ? "none" : "";
      if (visible) { if (manque) vues_manquantes++; else vues_ok++; }
      if (!manque) im.setAttribute("href", `data/photos/${code}/vues_${annee}_${v.p}.jpg`);
    });
    if (vues_manquantes) credit.textContent = vues_ok ? tr`Photo aérienne : SPW, ${annee}, et ${fondDe(annee)} là où le vol de ${annee} manque` : tr`Photo aérienne : SPW, ${fondDe(annee)} (pas de vol en ${annee} ici)`;
    else if (vues_ok) credit.textContent = tr`Photo aérienne : SPW, ${annee}`;
  };
  /* Les taches suivent l'année : pleines une fois bâties, en pointillé tant qu'elles sont à venir */
  const majTaches = () => et.taches.forEach((t, i) => {
    const fin = FIN_PERIODE[t.an ?? 2];
    taches[i].classList.toggle("a-venir", annee < fin);
  });
  const appliquerFond = () => {
    cadre.classList.toggle("sur-photo", fond === "photo");
    gFond.style.display = fond === "photo" ? "" : "none";
    gZones.style.display = coucheZones.checked ? "" : "none";
    if (fond === "photo") majFond();
    majVues();
  };

  const encart = h("div", { class: "encart" });
  const vide = () => encart.replaceChildren(h("h3", null, tr("Touchez une tache")),
    h("p", { class: "note" }, tr("Chaque tache est un bâtiment ou un revêtement apparu entre les photos de 2018 et celles de 2023. Touchez-en une pour voir quand elle est apparue, ce qu'il y avait avant, la zone du plan de secteur et la parcelle.")));
  const montrer = (i, fixe) => {
    const t = et.taches[i], p = t.p ? et.parcelles[t.p] : null;
    if (fixe) { choix.setAttribute("d", t.d); choixParc.setAttribute("d", p ? p.d : ""); }
    encart.replaceChildren(h("h3", null, t.c === "construction" ? tr("Nouveau bâtiment") : tr("Revêtement neuf")),
      h("dl", null,
        h("dt", null, tr("Apparu")), h("dd", null, PERIODES_TXT()[t.an ?? 2]),
        h("dt", null, tr("Surface")), h("dd", null, `${nombre(t.m2)} m²`),
        h("dt", null, tr("En 2018")), h("dd", null, AVANT_2018[t.a] || tr("n.d.")),
        h("dt", null, tr("Plan de secteur")), h("dd", null, FAMILLES[t.z] ? FAMILLES[t.z][0] : t.z),
        h("dt", null, tr("Centralité du SDT")), h("dd", null, t.ce ? tr("Oui") : tr("Non")),
        p ? [h("dt", null, tr("Parcelle")), h("dd", null, h("code", null, t.p)),
          h("dt", null, tr("Surface de la parcelle")), h("dd", null, `${nombre(p.m2)} m²`),
          h("dt", null, tr("Bâti neuf sur la parcelle")), h("dd", null, tr`${nombre(p.bati)} m², ${nombre(p.bati / p.m2 * 100)} %`)] : null),
      t.c !== "construction" ? h("p", { class: "note" }, tr("Allée, cour, parking ou voirie à moins de 10 m d'un nouveau bâtiment.")) : "",
      fixe ? h("button", { type: "button", class: "etal-bouton", onclick: () => zoomerSur(taches[i]) }, ph ? tr("Voir de près, en photo") : tr("Voir de près")) : "");
  };
  vide();

  /* Zoom et déplacement : on change la fenêtre (viewBox) en mètres. Molette avec Ctrl, pour ne pas bloquer le défilement de la page. */
  let vb = { x: 0, y: 0, w: L, h: H };
  const poser = () => { svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); svg.classList.toggle("loin", vb.w > 2500); echelle(); majVues(); };
  const borner = () => { vb.x = Math.min(Math.max(vb.x, -vb.w / 2), L - vb.w / 2); vb.y = Math.min(Math.max(vb.y, -vb.h / 2), H - vb.h / 2); };
  const zoomer = (f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) => {
    const w = Math.min(L, Math.max(120, vb.w * f)), k = w / vb.w;
    vb = { x: cx - (cx - vb.x) * k, y: cy - (cy - vb.y) * k, w, h: vb.h * k };
    borner(); poser();
  };
  const zoomerSur = (el) => {
    const b = el.getBBox(), w = Math.max(250, b.width * 4), k = w / vb.w;
    vb = { x: b.x + b.width / 2 - w / 2, y: b.y + b.height / 2 - (vb.h * k) / 2, w, h: vb.h * k };
    if (ph && fond !== "photo") { fond = "photo"; coucheZones.checked = false; boutonsFond(); appliquerFond(); }
    borner(); poser();
  };
  const versCarte = (ev) => { const c = svg.getBoundingClientRect(), k = Math.max(vb.w / c.width, vb.h / c.height);
    return [vb.x + (ev.clientX - c.left - (c.width - vb.w / k) / 2) * k, vb.y + (ev.clientY - c.top - (c.height - vb.h / k) / 2) * k]; };
  const pointeurs = new Map();
  let glisse = null, bouge = 0;
  svg.addEventListener("pointerdown", (e) => {
    pointeurs.set(e.pointerId, e); svg.setPointerCapture(e.pointerId); svg.classList.add("saisie");
    glisse = { vb: { ...vb }, x: e.clientX, y: e.clientY, d: null, cible: e.target.dataset && e.target.dataset.i }; bouge = 0;
    if (pointeurs.size === 2) { const [a, b] = [...pointeurs.values()]; glisse.d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); glisse.c = versCarte({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }); }
  });
  svg.addEventListener("pointermove", (e) => {
    if (!glisse) {
      if (e.pointerType === "mouse" && e.target.dataset && e.target.dataset.i && e.target.classList.contains("etal-tache") && !choix.getAttribute("d")) montrer(Number(e.target.dataset.i), false);
      return;
    }
    pointeurs.set(e.pointerId, e);
    const c = svg.getBoundingClientRect(), k = Math.max(glisse.vb.w / c.width, glisse.vb.h / c.height);
    if (pointeurs.size === 2 && glisse.d) {
      const [a, b] = [...pointeurs.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      vb = { ...glisse.vb }; zoomer(glisse.d / d, glisse.c[0], glisse.c[1]); bouge = 99; return;
    }
    bouge = Math.max(bouge, Math.hypot(e.clientX - glisse.x, e.clientY - glisse.y));
    vb = { ...glisse.vb, x: glisse.vb.x - (e.clientX - glisse.x) * k, y: glisse.vb.y - (e.clientY - glisse.y) * k };
    borner(); svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  });
  const lacher = (e) => {
    pointeurs.delete(e.pointerId);
    if (pointeurs.size) return;
    svg.classList.remove("saisie");
    if (glisse && bouge < 5 && e.type === "pointerup") {
      const i = glisse.cible;
      if (i) montrer(Number(i), true); else { choix.setAttribute("d", ""); choixParc.setAttribute("d", ""); vide(); }
    }
    glisse = null; poser();
  };
  svg.addEventListener("pointerup", lacher);
  svg.addEventListener("pointercancel", lacher);
  svg.addEventListener("wheel", (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); const [x, y] = versCarte(e); zoomer(e.deltaY > 0 ? 1.25 : 0.8, x, y); }, { passive: false });

  const barre = h("span");
  const blocEchelle = h("div", { class: "echelle etal-echelle", "aria-hidden": "true" }, barre);
  function echelle() {
    const c = svg.getBoundingClientRect(); if (!c.width) return;
    const mParPx = Math.max(vb.w / c.width, vb.h / c.height);
    const pas = [20, 50, 100, 200, 500, 1000, 2000, 5000].find((x) => x >= mParPx * 90) || 5000;
    blocEchelle.style.width = `${pas / mParPx}px`;
    barre.textContent = pas >= 1000 ? `${pas / 1000} km` : `${pas} m`;
  }
  new ResizeObserver(() => { echelle(); majVues(); }).observe(svg);

  const bouton = (texte, aide, f) => h("button", { type: "button", "aria-label": aide, title: aide, onclick: f }, texte);
  const outils = h("div", { class: "etal-outils" },
    bouton("+", tr("Zoomer"), () => zoomer(0.5)), bouton("−", tr("Dézoomer"), () => zoomer(2)),
    bouton("⤢", tr("Toute la commune"), () => { vb = { x: 0, y: 0, w: L, h: H }; poser(); }));
  const grandeAnnee = h("div", { class: "etal-annee", "aria-hidden": "true" }, String(annee));
  const credit = h("div", { class: "etal-credit" });
  const cadre = h("div", { class: "etal-carte", style: `aspect-ratio:${L} / ${H}` }, svg, outils, grandeAnnee, blocEchelle, ph ? credit : null);

  /* Commandes : fond, année, couches */
  const groupeFond = h("div", { class: "etal-segment", role: "group", "aria-label": tr("Fond de carte") });
  const boutonsFond = () => groupeFond.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.f === fond));
  for (const [f, t] of [["photo", tr("Photo aérienne")], ["plan", tr("Plan de secteur")]]) {
    if (f === "photo" && !ph) continue;
    groupeFond.append(h("button", { type: "button", "data-f": f, onclick: () => { fond = f; coucheZones.checked = f === "plan"; boutonsFond(); appliquerFond(); } }, t));
  }
  boutonsFond();
  const curseur = h("input", { type: "range", min: annees[0], max: annees.at(-1), step: 1, value: annee, "aria-label": tr("Année"), id: `annee-${code}` });
  const etiquette = h("output", { for: `annee-${code}`, class: "etal-curseur-annee" }, String(annee));
  const choisirAnnee = (a) => {
    annee = a; curseur.value = a; etiquette.textContent = grandeAnnee.textContent = String(a);
    majTaches(); if (fond === "photo") majFond(); majVues();
  };
  curseur.addEventListener("input", () => choisirAnnee(Number(curseur.value)));
  let minuterie = null;
  const lecture = h("button", { type: "button", class: "etal-lecture", "aria-label": tr("Faire défiler les années") }, "▶");
  const arreter = () => { clearInterval(minuterie); minuterie = null; lecture.textContent = "▶"; lecture.setAttribute("aria-label", tr("Faire défiler les années")); };
  lecture.addEventListener("click", () => {
    if (minuterie) return arreter();
    if (annee >= annees.at(-1)) choisirAnnee(annees[0]);
    lecture.textContent = "❚❚"; lecture.setAttribute("aria-label", tr("Arrêter"));
    minuterie = setInterval(() => { if (annee >= annees.at(-1)) arreter(); else choisirAnnee(annee + 1); }, 1300);
  });
  const reperesAnnees = h("div", { class: "etal-reperes", "aria-hidden": "true" }, annees.map((a) => h("span", null, String(a))));
  const blocCurseur = h("div", { class: "etal-curseur" }, lecture, h("div", { class: "etal-piste" }, curseur, reperesAnnees), etiquette);

  const coucheZones = h("input", { type: "checkbox", checked: fond === "plan", onchange: () => appliquerFond() });
  const couche = (texte, g, actif) => h("label", null, h("input", { type: "checkbox", checked: actif, onchange: (e) => { g.style.display = e.target.checked ? "" : "none"; } }), texte);
  const couches = h("div", { class: "etal-couches", role: "group", "aria-label": tr("Couches de la carte") },
    h("label", null, coucheZones, tr("Zones du plan de secteur")), couche(tr("Centralités du SDT"), gCentr, true), couche(tr("Parcelles où un bâtiment est apparu"), gParc, false));

  majTaches(); appliquerFond(); svg.classList.add("loin");
  return { commandes: h("div", { class: "etal-commandes" }, ph ? groupeFond : null, blocCurseur, couches), zone: h("div", { class: "etal-zone-carte" }, cadre, encart) };
}

/* Rythme par période de datation, en ha par an (les périodes n'ont pas la même durée) */
function barresPeriodes(r) {
  if (!r.periodes) return null;
  const duree = [1, 1, 3], lignes = Object.entries(r.periodes).map(([p, v], i) => ({ p, v, an: (v.batiments_ha + v.abords_ha) / duree[i], bat: v.batiments_ha / duree[i] }));
  const max = Math.max(...lignes.map((x) => x.an));
  return h("dl", { class: "etal-barres etal-periodes" }, lignes.flatMap((x) => [
    h("dt", null, x.p),
    h("dd", null, h("div", { class: "piste", role: "img", "aria-label": tr`${nombre(x.an, 1)} ha par an, dont ${nombre(x.bat, 1)} ha de bâtiments` },
      h("span", { class: "abords", style: `width:${x.an / max * 100}%` }), h("span", { style: `width:${x.bat / max * 100}%` }))),
    h("dd", { class: "val" }, tr`${nombre(x.an, 1)} ha/an`)]));
}


function sectionEtalement(c, et, ph) {
  const r = et.resume, fl = r.flux_cadastre;
  const centrPct = r.centralite.neuf_ha / r.neuf_ha * 100;
  const { commandes, zone } = carteEtalement(et, ph);
  const zonesPresentes = ORDRE_ZONES.filter((k) => et.zones[k]).reverse();
  const bruitPct = (r.bruit.batiments_inverses_ha + r.bruit.abords_inverses_ha) / r.neuf_ha * 100;
  return h("section", { class: "section", id: "etalement" },
    h("h2", null, tr("Où l'on a bâti, vu du ciel, 2018-2023")),
    h("p", null, tr`Entre les photos aériennes de 2018 et celles de 2023, ${nombre(r.batiments_ha, 1)} ha de nouveaux bâtiments sont apparus à ${c.nom}, et ${nombre(r.abords_ha, 1)} ha de revêtements à leurs abords. Soit ${nombre(r.neuf_ha, 1)} ha bâtis ou revêtus.`),
    fl ? h("p", null, tr`Le cadastre compte ${nombre(fl.ha, 1)} ha artificialisés de ${fl.annees[0]} à ${fl.annees[1]}. L'écart est attendu : le cadastre compte toute la parcelle, jardin compris, la photo seulement ce qui est bâti ou revêtu.`) : null,
    h("h3", null, tr("Dans quelle zone du plan de secteur")),
    barresZones(r),
    legende([["barre", "var(--neuf-bati)", tr("Part du neuf")], ["trait", "solid var(--encre)", tr("Trait : part de la commune couverte par cette zone")]]),
    h("p", null, tr`${nombre(centrPct)} % de ce neuf se trouve dans une centralité du SDT, qui couvre ${nombre(r.centralite.part_territoire_pct)} % de la commune.`),
    h("h3", null, tr("Année après année")),
    h("p", null, ph && ph.mode === "direct" ? tr("Faites glisser le curseur, ou lancez la lecture, pour voir les chantiers apparaître sur la photo aérienne de chaque année. Zoomez sur un quartier pour voir le détail.")
      : ph ? tr("Faites glisser le curseur, ou lancez la lecture, pour voir les chantiers apparaître. Zoomez sur un quartier : la photo aérienne de l'année choisie remplace alors le fond.")
      : tr("Faites glisser le curseur pour voir les chantiers apparaître.")),
    commandes, zone,
    legende([["barre", "var(--neuf-bati)", tr("Nouveau bâtiment")], ["barre", "var(--neuf-revet)", tr("Revêtement neuf aux abords")],
      ["trait", "dashed var(--encre-2)", tr("Pas encore bâti l'année choisie")], ["trait", "dashed var(--encre-2)", tr("Centralité du SDT")]]),
    h("details", { class: "etal-legende-zones" }, h("summary", null, tr("Couleurs du plan de secteur")),
      legende(zonesPresentes.map((k) => ["barre", FAMILLES[k][1], FAMILLES[k][0]]))),
    h("p", { class: "note" }, tr("Faites glisser pour vous déplacer. Boutons + et − pour zoomer, ou Ctrl et la molette. Sur téléphone, pincez.")),
    r.periodes ? [h("h3", null, tr("À quel rythme")), barresPeriodes(r),
      legende([["barre", "var(--neuf-bati)", tr("Bâtiments")], ["barre", "var(--neuf-revet)", tr("Revêtements aux abords")]]),
      h("p", { class: "note" }, tr`Surface apparue par an, selon la carte où elle se voit pour la première fois. Le SPW a aussi publié des cartes complètes de 2019 et de 2020, produites un peu autrement. Elles se contredisent parfois : ${nombre(r.controles.datation_incoherente_pct)} % de la surface vue bâtie en 2019 ne l'est plus en 2020. Ces dates sont donc approchées, et les petits chantiers des premières années peuvent avoir été vus en retard.`)] : null,
    h("p", { class: "note" }, tr`Seuls sont retenus les bâtiments neufs d'au moins 30 m² et les revêtements neufs à moins de 10 m d'eux. Les autres changements de revêtement sont surtout des écarts de classement entre les deux cartes : il en « disparaît » presque autant qu'il en apparaît. Avec la même règle, le mouvement inverse ne fait que ${nombre(bruitPct)} % du neuf retenu. `,
      h("a", { href: "#methode" }, tr("La méthode"))),
    tableChiffres(tr("Voir les chiffres par zone"), [tr("Zone du plan de secteur"), tr("Bâtiments neufs (ha)"), tr("Revêtements aux abords (ha)"), tr("Part de la commune (%)")],
      Object.entries(r.par_famille).sort((a, b) => (b[1].batiments_ha + b[1].abords_ha) - (a[1].batiments_ha + a[1].abords_ha))
        .map(([k, v]) => [FAMILLES[k][0], nombre(v.batiments_ha, 2), nombre(v.abords_ha, 2), nombre((r.territoire_par_famille_ha[k] || 0) / r.superficie_ha * 100, 1)])),
    h("p", { class: "note" }, tr("Sources : SPW, WalOUS, cartes d'occupation du sol 2019 et 2020 et changements 2018-2023, orthophotos 2018 à 2026, plan de secteur et centralités (CC BY 4.0) ; SPF Finances, plan parcellaire au 1er janvier 2025.")));
}

/* ---------- Méthode ---------- */
function sectionMethodeEtalement(titre2) {
  const e = etat.meta.etalement, w = e && e.wallonie, liste = [...pilotes()].sort((a, b) => sansAccent(a.nom).localeCompare(sansAccent(b.nom)));
  if (!liste.length) return null;
  const somme = (l, k) => l.reduce((s, x) => s + x[k], 0);
  return [
    titre2(tr("L'étalement vu du ciel : la méthode")),
    h("p", null, tr`Pour chacune des ${liste.length} communes, la fiche montre où l'on a bâti entre 2018 et 2023, sur le plan de secteur. La source est WalOUS : le SPW a fait classer chaque mètre carré de Wallonie par un modèle d'apprentissage automatique, à partir des photos aériennes et d'un modèle des hauteurs. Son exactitude globale annoncée est de 87 %, et de 92 % pour les constructions.`),
    w ? h("p", null, tr`Comparer deux cartes produites ainsi fait apparaître beaucoup de faux changements. Sur toute la Wallonie, WalOUS voit ${nombre(w.neuf_ha)} ha passer en artificiel entre 2018 et 2023, et ${nombre(w.retour_ha)} ha faire le chemin inverse. Le solde serait négatif, ce qui n'a pas de sens. La plupart de ces écarts sont des revêtements, bords de route, cours ou chemins, classés autrement d'une carte à l'autre. Les constructions sont bien plus stables : ${nombre(w.constructions_neuves_ha)} ha apparaissent, ${nombre(w.constructions_disparues_ha)} ha disparaissent.`) : null,
    h("h3", null, tr("La règle retenue")),
    h("ul", null,
      h("li", null, tr("Un bâtiment neuf est une surface classée « construction » en 2023, et ni bâtie ni revêtue en 2018. On retire les liserés de moins de 3 m de large, puis on garde les surfaces d'au moins 30 m².")),
      h("li", null, tr("Un revêtement neuf ne compte que s'il est à moins de 10 m d'un bâtiment neuf : allée, cour, parking ou voirie de lotissement.")),
      h("li", null, tr("Chaque surface est rattachée à la zone du plan de secteur, à la centralité et à la parcelle de 2025 qui en portent la plus grande part."))),
    h("p", null, tr("Pour mesurer le bruit qui reste, on applique la même règle au mouvement inverse : des constructions de 2018 devenues prairie, des revêtements disparus près des bâtiments neufs."),
      " ", tr`Sur l'ensemble des communes, cela donne ${nombre(somme(liste, "bruit_ha"))} ha pour ${nombre(somme(liste, "neuf_ha"))} ha retenus, soit ${nombre(somme(liste, "bruit_ha") / somme(liste, "neuf_ha") * 100)} %. Chaque fiche donne la part de sa commune.`),
    h("h3", null, tr("Les dates et les photos")),
    h("ul", null,
      h("li", null, tr("Le SPW a aussi publié des cartes complètes de l'occupation du sol en 2019 et en 2020. Une surface est datée de la première de ces cartes où elle est bâtie ou revêtue sur au moins la moitié de sa superficie, et sinon de 2020-2023. Le curseur la montre pleine à partir de la fin de cette période.")),
      h("li", null, tr("Les photos sont les orthophotos annuelles du SPW, de 2018 à 2026, lues en direct sur son service de visualisation. Certaines années, le vol ne couvre qu'une partie de la Wallonie : on complète d'abord avec l'autre vol de la même année. Pour 2022 et 2024, il reste des zones sans photo : la carte y montre celle de l'année précédente, et la mention en bas à droite le dit.")),
      h("li", null, tr("Les photos montrent l'état du terrain le jour du vol. Une tache peut donc apparaître sur la photo un peu avant ou après la date retenue."))),
    h("h3", null, tr("Les limites")),
    h("ul", null,
      h("li", null, tr("Le plan de secteur et les centralités sont ceux en vigueur aujourd'hui. Une zone a pu être modifiée depuis 2018.")),
      h("li", null, tr("Une serre, un hangar agricole ou un abri de jardin comptent comme des bâtiments. La carte ne dit pas si un bâtiment a un permis, ni à quoi il sert.")),
      h("li", null, tr("Les deux séries de photos datent de 2018 et de 2023, le cadastre compte du 1er janvier 2018 au 1er janvier 2023. Les périodes se recouvrent, sans coïncider exactement.")))];
}

function pageMethode() {
  const m = etat.meta, der = m.derniere_annee_flux, e = m.exemple, v = m.verifications, seuils = v.seuils;
  const [t5, t10] = v.test_seuil, partTest = (x) => nombre(x.oui / x.total * 100);
  const b = etat.bassins.find((x) => x.cle === e.bassin_cle);
  const w = etat.wallonie, [a0, a1] = anneesBilan();
  /* Bassins dont la situation changerait si l'on comptait l'année provisoire : on le dit, plutôt que de le cacher. */
  const situationAvec = (x) => (x.ratios.avec_provisoire > 1 + prochePct() / 100 ? "au-dessus" : x.ratios.avec_provisoire < 1 - prochePct() / 100 ? "en-dessous" : "proche");
  const changent = etat.bassins.filter((x) => situationAvec(x) !== x.statut);
  const lien = (f, t) => h("a", { href: `data/telechargements/${f}` }, t);
  const annee0 = m.trajectoire_debut;
  const anneesTraj = m.annees_flux.filter((a) => a >= annee0);
  const reclassEx = e.mouvements.find((x) => x.artificialise && x.ha < 0);
  const gainEx = e.mouvements.find((x) => !x.artificialise && x.ha > 0);
  const titres = [];
  const titre2 = (t) => { const el = h("h2", null, t); titres.push([t, el]); return el; };
  const choix = (t, ...p) => [h("h3", null, t), ...p.map((x) => h("p", null, x))];

  const prose = h("section", { class: "prose" },
    titre2(tr("La méthode en cinq étapes")),
    h("ol", null,
      h("li", null, tr("Lire, chaque 1er janvier, la surface de chaque nature cadastrale dans chaque commune (fichiers du SPF Finances).")),
      h("li", null, tr("Regrouper ces natures dans les 16 catégories de l'IWEPS. Les 9 premières forment le territoire artificialisé.")),
      h("li", null, tr("Calculer la part artificialisée, puis le flux de chaque année : la différence entre deux 1er janvier.")),
      h("li", null, tr("Signaler les années qui ressemblent à un reclassement au cadastre plutôt qu'à des constructions.")),
      h("li", null, tr("Comparer chaque commune à son propre passé, et chaque bassin à la trajectoire du SDT."))),

    titre2(tr`Un exemple complet : ${e.nom}`),
    h("p", null, tr`Nous suivons ici une seule commune, du fichier de départ au constat. Nous l'avons choisie parce que son année ${der} montre pourquoi un chiffre brut ne suffit pas. `, h("a", { href: `#commune-${e.code}` }, tr("Sa fiche")), tr(" affiche les mêmes chiffres.")),

    h("h3", null, tr("1. Le cadastre décrit des natures, pas de l'artificialisation")),
    h("p", null, tr`Au 1er janvier ${e.annee}, le fichier du SPF Finances compte ${e.nb_natures} natures à ${e.nom}. Voici les six plus étendues, et la catégorie où nous les plaçons.`),
    h("div", { class: "defile" }, tableSimple([tr("Nature cadastrale"), tr("Surface (ha)"), tr("Catégorie"), tr("Artificialisé")], e.premieres.map((n) => [natureL(n), nombre(n.ha, 1), categorieL(n), n.artificialise ? tr("Oui") : tr("Non")]), [2, 3])),

    h("h3", null, tr("2. On additionne pour obtenir le stock et la part")),
    h("div", { class: "calcul" },
      h("span", null, tr`Stock artificialisé au 1er janvier ${e.annee} : `, h("b", null, `${nombre(e.stock, 1)} ha`)),
      h("span", null, tr`Superficie de la commune : ${nombre(e.superficie, 1)} ha`),
      h("span", null, tr`Part : ${nombre(e.stock, 1)} ÷ ${nombre(e.superficie, 1)} = `, h("b", null, tr`${nombre(e.part, 1)} %`))),
    h("p", null, tr`L'IWEPS publiait ${nombre(e.part_iweps, 1)} % au 1er janvier ${m.stats.annee_iweps}, sa dernière année. La différence ne mesure donc pas une erreur : les deux chiffres ne portent pas sur la même date. Sur les années communes, les deux séries sont comparées plus bas.`),

    h("h3", null, tr("3. Le flux est la différence entre deux 1er janvier")),
    h("div", { class: "calcul" },
      h("span", null, tr`Flux ${e.annee_avant} = stock au 1er janvier ${e.annee} − stock au 1er janvier ${e.annee_avant}`),
      h("span", null, `= ${nombre(e.stock, 1)} − ${nombre(e.stock_avant, 1)} = `, h("b", null, `${signe(e.flux, 1)} ha`))),
    h("p", null, tr`Un stock au 1er janvier décrit ce qui s'est passé l'année précédente : c'est pourquoi la différence entre janvier ${e.annee_avant} et janvier ${e.annee} est attribuée à ${e.annee_avant}. Ce flux est un solde : les terrains entrés dans la catégorie artificialisée, moins les terrains sortis.`),

    h("h3", null, tr("4. Un solde négatif se lit nature par nature")),
    h("p", null, tr`Perdre ${nombre(Math.abs(e.flux))} ha artificialisés en un an serait surprenant pour une commune. Voici les cinq plus grands mouvements de l'année.`),
    h("div", { class: "defile" }, tableSimple([tr("Nature cadastrale"), tr`${e.annee_avant} (ha)`, tr`${e.annee} (ha)`, tr("Variation (ha)"), tr("Artificialisé")], e.mouvements.map((n) => [natureL(n), nombre(n.avant, 1), nombre(n.apres, 1), signe(n.ha, 1), n.artificialise ? tr("Oui") : tr("Non")]))),
    h("p", null, tr`« ${natureL(reclassEx)} » perd ${nombre(Math.abs(reclassEx.ha), 1)} ha pendant que « ${natureL(gainEx)} » gagne ${nombre(gainEx.ha, 1)} ha. Le plus probable est un changement d'inscription au cadastre, pas un retour de ces terrains à la nature. Nous ne savons pas d'où vient le reste du gain de « ${natureL(gainEx)} » : les données publiques ne suivent pas les parcelles une à une.`),
    h("div", { class: "calcul" },
      h("span", null, tr`Flux sans ce mouvement : ${signe(e.flux, 1)} + ${nombre(Math.abs(reclassEx.ha), 1)} = `, h("b", null, `${signe(e.flux_corrige, 1)} ha`)),
      h("span", null, tr`Médiane des flux annuels de la commune : ${signe(e.mediane, 1)} ha`)),

    h("h3", null, tr("5. Le rythme compare deux périodes")),
    h("div", { class: "defile" }, tableSimple([tr("Moyenne annuelle (ha/an)"), m.stats.passe.join("-"), m.stats.recent.join("-")], [
      [tr("Flux tels quels"), nombre(e.rythme_passe, 1), nombre(e.rythme_recent, 1)],
      [tr("Sans les variations signalées"), nombre(e.rythme_passe_corrige, 1), nombre(e.rythme_recent_corrige, 1)]])),
    h("p", null, tr("Deux rythmes sont dits « comparables » si leur écart reste sous 0,5 ha/an ou sous 15 %. La fiche ne conclut que si les deux lignes du tableau disent la même chose. Sinon, elle indique que le rythme est difficile à juger.")),

    h("h3", null, tr`6. Seul le bassin ${b.nom} est comparé à la trajectoire`),
    h("p", null, tr`Le SDT donne pour chaque bassin une référence R, puis une baisse en ligne droite jusqu'à zéro en ${m.trajectoire_fin}. La trajectoire d'une année N vaut R × (${m.trajectoire_fin} − N) ÷ ${m.trajectoire_fin - annee0}. Pour ce bassin, R vaut ${ha(b.reference)} ha/an.`),
    h("div", { class: "defile" }, tableSimple([tr("Année"), tr("Trajectoire (ha)"), tr("Observé (ha)")], [
      ...anneesTraj.map((a) => [String(a) + (a === der ? tr(" (provisoire, non compté)") : ""), nombre(trajectoire(b.reference, a), 1), nombre(b.flux[m.annees_flux.indexOf(a)], 1)]),
      [tr`Cumul ${a0}-${a1}`, nombre(b.cumul_autorise_confirme, 1), nombre(b.cumul_observe_confirme, 1)]])),
    h("div", { class: "calcul" }, h("span", null, tr`Part du cumul de la trajectoire : ${nombre(b.cumul_observe_confirme, 1)} ÷ ${nombre(b.cumul_autorise_confirme, 1)} = `, h("b", null, tr`${nombre(b.ratio * 100)} %`))),
    h("p", null, tr`Le bassin ${b.nom} est donc ${SITUATIONS[b.statut][2]}. ${ecartBilan(b)}`),

    titre2(tr`Le bilan des bassins : ${a0}-${a1}`),
    h("p", null, tr`Selon le Code du développement territorial, le SDT a valeur indicative. Son cap est d'arriver à zéro hectare artificialisé par an en ${m.trajectoire_fin}. La ligne droite tracée pour chaque bassin sert de repère pour suivre le chemin : ce n'est pas un quota annuel. Un bassin peut passer au-dessus quelques années, puis ralentir plus fort ensuite. Le portail mesure l'écart à ce repère, sans dire si c'est bien ou mal.`),
    h("p", null, tr`Comparer un bassin à sa trajectoire revient à une division : les hectares artificialisés depuis ${a0}, divisés par ceux que la trajectoire prévoyait sur la même période. À 100 %, le bassin est exactement sur la trajectoire. Le portail ne donne qu'un chiffre par bassin. Voici les trois choix qui le fixent.`),
    h("h3", null, tr`Pourquoi s'arrêter à ${a1}`),
    h("p", null, tr`L'IWEPS indique que la dernière année d'une matrice cadastrale est incomplète : une partie des changements de ${der} ne sera inscrite au cadastre que plus tard. Compter ${der} mélangerait des années définitives et une année partielle. Nous la montrons sur les graphiques, hachurée, mais elle n'entre pas dans le bilan.`),
    h("p", null, tr`Pour la Wallonie, la compter donnerait ${nombre(w.ratios.avec_provisoire * 100)} % au lieu de ${nombre(w.ratio * 100)} %.`,
      changent.length ? tr` La situation de ${changent.length} ${pluriel(changent.length, tr("bassin"), tr("bassins"))} changerait : ${changent.map((x) => tr`${x.nom} (${nombre(x.ratios.avec_provisoire * 100)} % au lieu de ${nombre(x.ratio * 100)} %)`).join(", ")}. Nous referons le bilan quand ${der} sera définitif.` : ""),
    h("h3", null, tr("Pourquoi garder les variations signalées")),
    h("p", null, tr("Le bilan compte le flux tel quel, reclassements probables compris. Aucune source extérieure ne confirme ces corrections (voir « Repérer les reclassements ») : elles servent à nuancer le rythme des communes, pas à changer le bilan des bassins.")),
    h("h3", null, tr`Pourquoi « proche » à ${prochePct()} %`),
    h("p", null, tr`Ni la référence lue sur les graphiques du SDT ni l'estimation des flux ne sont exactes à l'hectare près. La lecture des graphiques, à elle seule, laisse une marge de ${nombre(w.incertitude / w.reference * 100, 1)} % pour la Wallonie. Quand le bilan est à moins de ${prochePct()} % de la trajectoire, nous ne disons donc ni « au-dessus » ni « sous », mais « proche ». Ces ${prochePct()} % sont une convention, discutable.`),

    titre2(tr("Les choix, et ce qui les justifie")),
    ...choix(tr("Prolonger l'IWEPS par une estimation"),
      tr`L'IWEPS est la référence, mais sa série communale s'arrête au 1er janvier ${m.stats.annee_iweps} et ses parts sont arrondies à 0,1 point. Cet arrondi vaut environ 5 ha pour une commune médiane, ce qui suffit à masquer un flux annuel. Le SPF Finances publie les surfaces jusqu'au 1er janvier ${m.stats.annee_stock}, en hectares précis.`,
      tr("Ce choix a un coût : nos chiffres sont une estimation, pas des chiffres de l'IWEPS. C'est pourquoi les fiches montrent les deux courbes séparément, sans jamais les raccorder.")),
    ...choix(tr("Déduire la table des natures à partir des données"),
      tr("L'IWEPS ne publie pas sa table de passage entre natures et catégories. Nous l'avons déduite : pour chaque catégorie, une régression cherche quelles natures reproduisent les surfaces publiées, et chaque nature rejoint la catégorie où elle pèse le plus. Les 118 petites natures que la régression ne permet pas de trancher (0,6 % de la surface cadastrée) sont classées d'après leur libellé."),
      h("span", null, tr("Cette table reste notre construction. "), lien("table_natures_categories.csv", tr("Elle est téléchargeable")), tr(" pour être contestée."))),
    ...choix(tr("Ne pas compter « Terrain » et « Terrain à bâtir » comme artificialisés"),
      tr`Ce n'est pas notre préférence : c'est ce que disent les chiffres de l'IWEPS, que l'on ne reproduit qu'en les classant hors du territoire artificialisé. Le choix pèse lourd. La nature « Terrain » a gagné ${nombre(e.terrain_gain_wallonie)} ha en Wallonie depuis ${m.stats.premiere_annee}. Un terrain peut donc sortir de la catégorie sans qu'aucun sol ne soit rendu à la nature.`),
    ...choix(tr("Compter les jardins et les parcelles entières"),
      tr("Le jardin suit la maison dans la catégorie résidentielle : c'est ce que montrent les chiffres de l'IWEPS. Et une parcelle change de catégorie en entier, même si seule une partie est construite. L'indicateur mesure donc un usage inscrit au cadastre, pas le béton réellement posé.")),
    ...choix(tr("Ne pas fixer de trajectoire par commune"),
      tr("Le SDT fixe des trajectoires par bassin. En déduire une limite communale serait une construction de notre part, que rien n'impose à une commune. Les fiches comparent donc chaque commune à son propre passé et à son bassin. Seules les pages des bassins confrontent les chiffres à la trajectoire.")),
    ...choix(tr`Prendre ${m.stats.passe.join("-")} comme période de comparaison`,
      tr`Le SDT calcule sa référence sur les dix ans 2010-2019, avant la pandémie. Nous gardons la même fin de période. Elle commence un an plus tard, car le fichier du SPF au 1er janvier 2010 n'existe pas : notre premier flux est 2011.`),
    ...choix(tr("Lire les références sur les graphiques du SDT"),
      tr("Le SDT ne publie pas les valeurs de ses références par bassin. Nous les avons lues sur ses graphiques, à environ 2,2 ha/an près. C'est la référence officielle : nous ne la remplaçons pas par une valeur recalculée sur nos données.")),

    titre2(tr("Repérer les reclassements")),
    h("p", null, tr("Une partie des variations ne vient pas de chantiers, mais d'une parcelle qui change d'inscription au cadastre. Le portail affiche toujours le flux tel quel. Il signale en plus trois situations.")),
    h("h3", null, tr("Le reclassement probable")),
    h("p", null, tr("Une année est marquée ainsi quand trois conditions sont réunies :")),
    h("ul", null,
      h("li", null, tr`Une nature artificialisée perd au moins ${nombre(seuils.sortie_ha)} ha en un an. Ce seuil vient d'un test sur les années qui remplissent aussi la condition suivante : à ${nombre(t5.ha)} ha, retirer la perte ne rapproche l'année de la médiane communale que dans ${partTest(t5)} % des cas (${t5.oui} sur ${t5.total}), contre ${partTest(t10)} % à ${nombre(t10.ha)} ha (${t10.oui} sur ${t10.total}). Ce test porte sur peu de cas : il justifie l'ordre de grandeur du seuil, pas sa valeur exacte.`),
      h("li", null, tr`Une nature non artificialisée gagne la même année au moins ${seuils.couverture_pct} % de cette perte. C'est la signature d'un transfert.`),
      h("li", null, tr`Retirer cette perte réduit au moins de moitié l'écart à la médiane de la commune. Sinon, le mouvement n'explique pas l'année.`)),
    h("p", null, tr`Cette règle trouve ${v.reclassements.annees} années dans ${v.reclassements.communes} communes, sur ${nombre(v.couples)} couples commune-année. Le flux corrigé retire seulement la perte identifiée. `, lien("reclassements_probables.csv", tr("La liste complète est téléchargeable")), "."),
    h("p", null, tr("Elle ne traite que les sorties. Dans l'autre sens, un terrain qui devient un entrepôt d'un seul coup peut être un reclassement comme un vrai chantier, et le cadastre ne permet pas de trancher.")),
    h("h3", null, tr("Le solde très négatif")),
    h("p", null, tr`Un flux inférieur à ${nombre(seuils.negatif_ha)} ha sans cause identifiée (${v.negatifs.annees} années) ne peut pas venir de constructions. L'année est signalée, et remplacée par la médiane de la commune dans les lectures corrigées.`),
    h("h3", null, tr("Le saut")),
    h("p", null, tr`Une année s'écarte de la médiane de la commune de plus de ${nombre(seuils.saut_ha)} ha et de plus de ${nombre(seuils.saut_mad)} écarts absolus médians (${v.sauts.annees} années). Il peut s'agir d'un vrai chantier. Médiane et écart sont calculés sans les années déjà expliquées : sinon, une commune aux reclassements répétés relèverait elle-même son seuil et ne signalerait plus rien.`),
    h("h3", null, tr("Ce que ces corrections valent")),
    h("p", null, tr("Aucune source extérieure ne les confirme. L'outil ATOL-C de la CPDT, dans notre échantillon de 33 communes, couvre trois de ces reclassements : à Anderlues en 2012 et à Gouvy en 2016, il affiche lui aussi un solde négatif. À Seraing en 2015, il affiche un flux proche de notre valeur corrigée. C'est pourquoi la correction n'intervient que dans le constat sur le rythme des communes, jamais dans le bilan des bassins. Le flux brut reste visible partout.")),

    titre2(tr("Comment l'estimation a été contrôlée")),
    h("p", null, tr("Test du 7 novembre 2026 :")),
    h("ul", null,
      h("li", null, tr("Sur 2011-2023, l'écart moyen avec l'IWEPS est de 0,026 point. C'est le bruit attendu d'un arrondi à 0,1 point.")),
      h("li", null, tr("Sur 33 communes dont les flux sont affichés en hectares par l'outil ATOL-C de la CPDT, l'écart annuel médian est de 0,08 ha, et 3 % des écarts dépassent 1 ha.")),
      h("li", null, tr("Ce résultat tient quand la table est apprise sans ces communes et sans les années après 2018.")),
      h("li", null, tr("Pour la Wallonie entière, on obtient 11,21 km²/an en 2015-2019 pour 11,2 publiés par l'IWEPS, 12,47 pour 12,3 en 2020-2024, et 10,10 pour 10,5 en 2025. Les deux derniers écarts ne sont pas expliqués."))),

    titre2(tr("Les règles d'interprétation")),
    h("p", null, tr("Les phrases des fiches sont produites par des règles fixes, les mêmes pour toutes les communes :")),
    h("ul", null,
      h("li", null, tr("Une commune est « proche » de la médiane de son bassin à moins de 1 point d'écart.")),
      h("li", null, tr`Le rythme récent couvre ${m.stats.recent.join("-")}. Il est comparé à ${m.stats.passe.join("-")}.`),
      h("li", null, tr("Si retirer les variations signalées change le constat sur le rythme, la fiche dit qu'il est difficile à juger.")),
      h("li", null, tr("Un solde récent négatif est expliqué par les variations signalées lorsqu'il redevient positif sans elles.")),
      h("li", null, tr`Un bassin est « proche » de sa trajectoire quand son bilan s'en écarte de moins de ${prochePct()} %.`)),
    h("p", null, tr("Un point est un point de pourcentage, c'est-à-dire la différence entre deux pourcentages. Passer de 35,1 à 35,5 % du territoire, c'est gagner 0,4 point, et non 0,4 %. L'arrondi de l'IWEPS à 0,1 point et l'écart à la médiane du bassin s'expriment ainsi.")),

    sectionMethodeEtalement(titre2),
    titre2(tr("Ce que ce portail ne dit pas")),
    h("ul", null,
      h("li", null, tr("Il ne mesure pas l'imperméabilisation. Les photos aériennes ne servent qu'à la carte de l'étalement, et rien ne remplace une visite de terrain.")),
      h("li", null, tr("Il ne mesure pas l'effet du SDT : un permis met plusieurs années à apparaître au cadastre.")),
      h("li", null, tr("Certaines années communales restent éloignées de l'IWEPS, par exemple Seraing en 2015.")),
      h("li", null, tr("Il ne dit pas qu'une commune a enfreint une règle.")),
      h("li", null, tr("Il ne dit pas qu'un bassin est en faute quand il est au-dessus de sa trajectoire : c'est un repère, pas un plafond."))),

    titre2("Sources"),
    h("ul", null,
      h("li", null, h("a", { href: "https://www.geo.be/catalog/details/86999d70-51ca-11eb-9238-3448ed25ad7c?l=fr" }, tr("SPF Finances, Occupation du sol")), tr(", CC BY 4.0, annuel.")),
      h("li", null, h("a", { href: "https://opendata.iweps.be/" }, tr("IWEPS, données ouvertes")), tr(", indicateurs 215700_0 à 215700_16, CC0, et fiche T005 de septembre 2026.")),
      h("li", null, h("a", { href: "https://statbel.fgov.be/fr/open-data/secteurs-statistiques-2025" }, tr("Statbel, secteurs statistiques 2025")), tr(" et occupation du sol, CC BY 4.0. Les limites communales sont fusionnées et simplifiées à partir des secteurs.")),
      h("li", null, h("a", { href: "https://territoire.wallonie.be/storage/territoire/documents/content/publication/sdt-web-pages.pdf" }, tr("Schéma de développement du territoire, 2024")), "."),
      h("li", null, h("a", { href: "https://geodata.wallonie.be/id/03300ff8-5e1d-430d-876a-ffd1b9103e78" }, tr("SPW, WalOUS, changements d'occupation du sol 2018-2023")), tr(", CC BY 4.0. Avec le plan de secteur et les centralités du SDT, du SPW, CC BY 4.0.")),
      h("li", null, tr("SPF Finances, plan parcellaire cadastral au 1er janvier 2025, licence open data du SPF.")),
      h("li", null, h("a", { href: "https://geoportail.wallonie.be/catalogue-donnees-et-services" }, tr("SPW, orthophotos annuelles 2018 à 2026")), tr(", CC BY 4.0, lues par les services de visualisation du SPW.")),
      h("li", null, tr("Polices Oswald et Lato, licence SIL Open Font."))),

    titre2(tr("Télécharger les données")),
    h("ul", null,
      h("li", null, lien("stocks_par_commune.csv", tr("Stocks par commune et par catégorie")), `, ${m.annees_stock[0]}-${m.stats.annee_stock}.`),
      h("li", null, lien("flux_par_commune.csv", tr("Flux annuels par commune")), tr`, ${m.annees_flux[0]}-${der}, avec les signalements et le flux corrigé.`),
      h("li", null, lien("reclassements_probables.csv", tr("Reclassements probables")), tr(", avec les natures en cause.")),
      h("li", null, lien("flux_par_bassin.csv", tr("Flux et trajectoires par bassin")), "."),
      h("li", null, lien("table_natures_categories.csv", tr("Table nature vers catégorie")), ".")));

  const sommaire = h("ul", { class: "sommaire" }, titres.map(([t, el]) => h("li", null, h("button", { type: "button", onclick: () => el.scrollIntoView({ block: "start" }) }, t))));
  return [grille({
    colle: true,
    tete: [h("p", { class: "fil" }, tr("Méthode")), h("h1", null, tr("Comment ces chiffres sont calculés")),
      h("p", { class: "chapeau" }, tr("Cette page décrit chaque étape, du fichier du cadastre au constat affiché, avec les chiffres réels d'une commune. Chaque choix est justifié, pour que vous puissiez le contester.")),
      h("p", { class: "note" }, tr("C'est une étude indépendante. Aucune institution citée ne l'a commandée ni validée. Auteur et contact : à compléter avant publication.")),
      enAnglais() ? h("p", { class: "note" }, tr("note:termes")) : null],
    corps: prose,
    haut: [h("h2", null, tr("Sur cette page")), sommaire],
  })];
}

function pageIntrouvable() {
  return [h("section", { class: "section" }, h("h1", null, tr("Cette page n'existe pas")),
    h("p", null, h("a", { href: "#accueil" }, tr("Revenir à la carte"))))];
}

/* ---------- Index des bassins et des communes ---------- */
function construireIndex() {
  const racine = document.getElementById("index");
  const bloc = (titre, cle, communes, b) => h("details", { "data-bassin": cle },
    h("summary", null, h("span", null, titre), b ? h("i", { class: b.statut, title: SITUATIONS[b.statut][1] }, tr`${nombre(b.ratio * 100)} %`) : null),
    h("ul", null, cle !== "hors" ? h("li", null, h("a", { href: `#bassin-${cle}`, "data-lien": `bassin-${cle}` }, tr("Vue du bassin"))) : null,
      communes.map((c) => h("li", null, h("a", { href: `#commune-${c.code}`, "data-lien": `commune-${c.code}` }, c.nom)))));
  racine.replaceChildren(h("div", { class: "index-titre" }, tr("Bassins")),
    h("a", { class: "index-region", href: "#bassins", "data-lien": "bassins" }, tr("Les sept bassins")),
    ...etat.bassins.map((b) => bloc(b.nom, b.cle, etat.communes.filter((c) => c.bassin_cle === b.cle), b)),
    bloc(tr("Hors SDT"), "hors", etat.communes.filter((c) => !c.bassin), null));
}
function marquerIndex(cle, bassin) {
  const racine = document.getElementById("index");
  racine.querySelectorAll("[aria-current]").forEach((a) => a.removeAttribute("aria-current"));
  const lien = racine.querySelector(`[data-lien="${cle}"]`);
  if (lien) lien.setAttribute("aria-current", "page");
  if (bassin) {
    const d = racine.querySelector(`details[data-bassin="${bassin}"]`);
    if (d) d.open = true;
    if (lien && getComputedStyle(racine).display !== "none") lien.scrollIntoView({ block: "nearest" });
  }
}

/* ---------- Recherche ---------- */
function activerRecherche() {
  const champ = document.getElementById("champ-recherche");
  const liste = document.getElementById("resultats-recherche");
  let actif = -1, resultats = [];
  const fermer = () => { liste.hidden = true; champ.setAttribute("aria-expanded", "false"); champ.removeAttribute("aria-activedescendant"); actif = -1; };
  const marquer = () => {
    [...liste.children].forEach((li, i) => li.setAttribute("aria-selected", i === actif));
    if (actif >= 0) champ.setAttribute("aria-activedescendant", `resultat-${actif}`);
  };
  const aller = (c) => { champ.value = ""; fermer(); location.hash = `commune-${c.code}`; };
  champ.addEventListener("input", () => {
    const q = sansAccent(champ.value);
    if (!q) return fermer();
    const debut = [], dedans = [];
    for (const c of etat.communes) {
      const n = sansAccent(c.nom);
      if (n.startsWith(q)) debut.push(c); else if (n.includes(q)) dedans.push(c);
    }
    resultats = [...debut, ...dedans].slice(0, 8);
    liste.replaceChildren(...(resultats.length ? resultats.map((c, i) => h("li", { id: `resultat-${i}`, role: "option", "aria-selected": "false", onpointerdown: (e) => { e.preventDefault(); aller(c); } }, c.nom, h("small", null, c.bassin || tr("Hors SDT"))))
      : [h("li", { role: "option", "aria-selected": "false" }, tr("Aucune commune wallonne à ce nom"))]));
    liste.hidden = false;
    champ.setAttribute("aria-expanded", "true");
    actif = resultats.length ? 0 : -1;
    marquer();
  });
  champ.addEventListener("keydown", (e) => {
    if (e.key === "Escape") return fermer();
    if (liste.hidden || !resultats.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); actif = (actif + 1) % resultats.length; marquer(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); actif = (actif - 1 + resultats.length) % resultats.length; marquer(); }
    else if (e.key === "Enter") { e.preventDefault(); aller(resultats[Math.max(actif, 0)]); }
  });
  champ.addEventListener("blur", fermer);
}

/* ---------- Navigation ---------- */
const lienFil = (t, cible) => [" / ", h("a", { href: `#${cible}` }, t)];
async function router() {
  const cle = location.hash.replace(/^#/, "") || "accueil";
  let contenu, titre = "Sols wallons", page = "accueil", fil = [], bassin = null;
  try {
    if (cle === "accueil") contenu = pageAccueil();
    else if (cle === "bassins") { contenu = pageBassins(); titre = tr("Bassins · Sols wallons"); page = "bassins"; fil = lienFil(tr("Bassins"), "bassins"); }
    else if (cle === "communes") { contenu = pageCommunes(); titre = tr("Communes · Sols wallons"); page = "communes"; fil = lienFil(tr("Communes"), "communes"); }
    else if (cle === "methode") { contenu = pageMethode(); titre = tr("Méthode · Sols wallons"); page = "methode"; fil = lienFil(tr("Méthode"), "methode"); }
    else if (cle.startsWith("bassin-")) {
      contenu = pageBassin(cle.slice(7)); page = "bassins";
      const b = etat.bassins.find((x) => x.cle === cle.slice(7));
      if (b) { titre = tr`Bassin ${b.nom} · Sols wallons`; bassin = b.cle; fil = [...lienFil(tr("Bassins"), "bassins"), " / ", b.nom]; }
    } else if (cle.startsWith("commune-")) {
      const code = Number(cle.slice(8));
      page = "communes";
      if (!etat.parCode.has(code)) contenu = pageIntrouvable();
      else {
        vue.replaceChildren(h("p", { class: "chargement" }, tr("Chargement de la commune…")));
        const c = await chargerCommune(code);
        const pilote = pilotes().find((x) => x.code === code);
        const [et, ph] = pilote ? await Promise.all([lireJson(`data/etalement/${code}.json`).catch(() => null),
          orthoDirecte().then((ok) => (ok ? { mode: "direct" } : pilote.photos ? lireJson(`data/photos/${code}/index.json`).catch(() => null) : null))]) : [null, null];
        if (location.hash.replace(/^#/, "") !== cle) return;
        contenu = pageCommune(c, et, ph);
        titre = `${c.nom} · Sols wallons`;
        bassin = c.bassin_cle || "hors";
        fil = [...lienFil(tr("Communes"), "communes"), " / ", c.nom];
      }
    } else contenu = pageIntrouvable();
  } catch (err) {
    console.error(err);
    contenu = [h("section", { class: "section" }, h("h1", null, tr("Ces données n'ont pas pu être chargées")), h("p", null, tr("Rechargez la page. Si le problème continue, revenez plus tard.")))];
  }
  vue.replaceChildren(...contenu);
  document.title = titre;
  document.getElementById("fil-global").replaceChildren(h("b", null, h("a", { href: "#accueil" }, "Sols wallons")), ...fil.flat());
  document.querySelectorAll(".rail-lien").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  marquerIndex(cle, bassin);
  window.scrollTo(0, 0);
  if (cle !== "accueil") vue.focus({ preventScroll: true });
}

async function demarrer() {
  try {
    const d = await lireJson("data/index.json");
    etat.meta = d.meta;
    etat.communes = [...d.communes].sort((a, b) => sansAccent(a.nom).localeCompare(sansAccent(b.nom)));
    etat.parCode = new Map(d.communes.map((c) => [c.code, c]));
    etat.bassins = d.bassins;
    etat.wallonie = d.wallonie;
  } catch (err) {
    console.error(err);
    vue.replaceChildren(h("section", { class: "section" }, h("h1", null, tr("Les données n'ont pas pu être chargées")),
      h("p", null, location.protocol === "file:" ? tr("Ce portail doit être servi par un serveur web. Il ne fonctionne pas s'il est ouvert directement comme fichier.") : tr("Rechargez la page. Si le problème continue, revenez plus tard."))));
    return;
  }
  construireIndex();
  activerRecherche();
  // Le lien d'évitement déplace le focus sans changer de page.
  document.querySelector(".evitement").addEventListener("click", (e) => { e.preventDefault(); vue.focus(); });
  window.addEventListener("hashchange", router);
  router();
}
/* Textes de la page d'accueil du navigateur (index.html) : le français y est écrit en dur, l'anglais posé ici. */
function textesStatiques() {
  const poser = (sel, texte, attr) => {
    const e = document.querySelector(sel);
    if (!e) return;
    if (attr) e.setAttribute(attr, texte); else e.textContent = texte;
  };
  document.documentElement.lang = etat.langue;
  poser(".evitement", tr("Aller au contenu"));
  poser(".rail", tr("Pages"), "aria-label");
  poser(".rail-marque", tr("Sols wallons, accueil"), "aria-label");
  poser('.rail-lien[data-page="accueil"] span', tr("Carte"));
  poser('.rail-lien[data-page="bassins"] span', tr("Bassins"));
  poser('.rail-lien[data-page="communes"] span', tr("Communes"));
  poser('.rail-lien[data-page="methode"] span', tr("Méthode"));
  poser("#index", tr("Bassins et communes"), "aria-label");
  poser('label[for="champ-recherche"]', tr("Chercher une commune"));
  poser("#champ-recherche", tr("Votre commune, par exemple Ciney"), "placeholder");
  poser("#resultats-recherche", tr("Communes trouvées"), "aria-label");
  poser(".mention", tr("Étude indépendante"));
  poser(".chargement", tr("Chargement des données…"));
  document.querySelector(".pied").replaceChildren(...[
    h("p", null, tr("Étude indépendante. L'IWEPS, le SPF Finances, Statbel, la CPDT et la Région wallonne ne sont pas associés à ce portail et ne l'ont pas validé.")),
    h("p", null, tr("Données : SPF Finances et Statbel (CC BY 4.0), IWEPS (CC0), SDT 2024. "), h("a", { href: "#methode" }, tr("Sources et méthode")), "."),
    enAnglais() ? h("p", null, tr("note:traduction")) : null].filter(Boolean));
  const bouton = document.getElementById("bouton-langue");
  bouton.querySelector("span").textContent = enAnglais() ? "FR" : "EN";
  bouton.setAttribute("aria-label", enAnglais() ? "Lire en français" : "Read in English");
  bouton.setAttribute("lang", enAnglais() ? "fr" : "en");
  afficherTheme();
}
function textesConstants() {
  textesStatuts();
  textesMesures();
  textesGroupes();
  textesEtalement();
}
function brancherLangue() {
  document.getElementById("bouton-langue").addEventListener("click", () => {
    etat.langue = enAnglais() ? "fr" : "en";
    try { localStorage.setItem("sols-langue", etat.langue); } catch { /* le choix vaut alors pour cette visite */ }
    textesConstants();
    textesStatiques();
    if (etat.meta) { construireIndex(); router(); }
  });
}
textesConstants();
textesStatiques();
brancherTheme();
brancherLangue();
demarrer();
