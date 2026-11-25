// Observation des matchs : Programme National Élite & Sélection nationale U23 de football (Bénin)
// Les observateurs (coachs de club, DTN, sélectionneurs, CTR, manager) identifient jusqu'à 5 joueurs par match ;
// le staff du programme consulte la base des joueurs identifiés.
// Concepteur : Alexandre GERBER
"use strict";

const cfg = window.OBS_CONFIG;
const racine = document.getElementById("app");
const zoneMessage = document.getElementById("message");
const boutonDeconnexion = document.getElementById("btn-menu-deconnexion");

let sb = null;
try { sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY); }
catch (e) { racine.textContent = "Impossible de charger l'application. Vérifie ta connexion internet puis recharge la page."; }

const FONCTIONS = ["Coach de club", "DTN", "DTN adjoint", "Sélectionneur U15", "Sélectionneur U17", "Sélectionneur U20",
  "Sélectionneur U23 (garçons)", "Sélectionneur U23 (filles)", "Manager", "CTR", "Staff du programme élite", "Autre"];
const MOTIFS = [
  ["qualite_technique", "Qualité technique forte"],
  ["qualite_tactique", "Qualité tactique forte"],
  ["qualite_physique", "Qualité physique forte"],
  ["leadership", "Leadership"],
  ["determinant", "Déterminant pour son équipe (duels, dribbles, percussion, buts, passes décisives, arrêts du gardien…)"]
];
const MOTIFS_COURT = { qualite_technique: "Technique", qualite_tactique: "Tactique", qualite_physique: "Physique", leadership: "Leadership", determinant: "Déterminant" };
const POSTES = [["", "Poste inconnu"], ["GB", "Gardien de but"], ["DEF", "Défenseur"], ["MIL", "Milieu"], ["ATT", "Attaquant"]];
const POSTES_OBS = [["gardien", "Gardien"], ["defenseur_central", "Défenseur central"], ["lateral", "Latéral"], ["milieu_axial", "Milieu axial"], ["milieu_excentre", "Milieu excentré"], ["attaquant", "Attaquant"]];
const POSTE_LIB = { gardien: "Gardien", defenseur_central: "Défenseur central", lateral: "Latéral", milieu_axial: "Milieu axial", milieu_excentre: "Milieu excentré", attaquant: "Attaquant", GB: "Gardien", DEF: "Défenseur", MIL: "Milieu", ATT: "Attaquant" };
const POSTE_GROUPE = { gardien: "GB", defenseur_central: "DEF", lateral: "DEF", milieu_axial: "MIL", milieu_excentre: "MIL", attaquant: "ATT", GB: "GB", DEF: "DEF", MIL: "MIL", ATT: "ATT" };
const MAX_JOUEURS = 5;
const CLE_BROUILLON = "obs_brouillon_v1";

/* ---------- Utilitaires ---------- */
function el(tag, attrs = {}, enfants = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const e of [].concat(enfants)) n.append(e instanceof Node ? e : document.createTextNode(e));
  return n;
}
let minuteurMessage = null;
function afficherMessage(texte, type = "info") {
  zoneMessage.textContent = texte;
  zoneMessage.className = "message " + type;
  clearTimeout(minuteurMessage);
  minuteurMessage = setTimeout(() => zoneMessage.classList.add("cache"), 6000);
}
function erreurReseau(err) {
  const m = (err && err.message ? err.message : "").toLowerCase();
  return !navigator.onLine || m.includes("fetch") || m.includes("network") || m.includes("load failed");
}
function messageErreur(err) {
  const m = (err && err.message ? err.message : "").toLowerCase();
  if (erreurReseau(err)) return "Pas de connexion internet. Ta saisie est gardée : réessaie dès que le réseau revient.";
  if (m.includes("invalid login")) return "Identifiant ou mot de passe incorrect.";
  if (m.includes("maximum 5")) return "Maximum 5 joueurs par match pour un même observateur.";
  if (m.includes("duplicate") || m.includes("unique")) return "Ce joueur (club et numéro) est déjà identifié par toi pour ce match.";
  if (m.includes("rate limit")) return "Trop de tentatives. Patiente quelques minutes.";
  return "Une erreur est survenue. Réessaie, et préviens Alexandre GERBER si elle persiste.";
}
function lire(cle, defaut) { try { const v = JSON.parse(localStorage.getItem(cle)); return v === null || v === undefined ? defaut : v; } catch (e) { return defaut; } }
function ecrire(cle, v) { try { localStorage.setItem(cle, JSON.stringify(v)); } catch (e) { /* sans importance */ } }
function effacer(cle) { try { localStorage.removeItem(cle); } catch (e) { /* sans importance */ } }
function dateLocale(d = new Date()) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function jfr(iso) { return iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : ""; }
function barreTitre(titre, retour) {
  return el("div", { class: "barre-titre" }, [el("button", { class: "btn-retour", type: "button", text: "← Retour", onclick: retour }), el("h1", { text: titre })]);
}
function signature() {
  return el("div", { class: "signature" }, [el("div", { text: "Concepteurs :" }), el("div", { text: "Alexandre GERBER" }), el("div", { text: "Vincent RAUTUREAU" }),
    el("div", { class: "made", text: "Made in Bénin : un outil de suivi et d'excellence des talents béninois 🇧🇯⚽ Guépards et Amazones." })]);
}

async function emailDepuisIdentifiant(v) {
  v = String(v || "").trim();
  if (v.includes("@")) return v.toLowerCase();
  if (v.length < 3) return "";
  const { data } = await sb.rpc("email_par_identifiant", { ident: v });
  return data || "";
}

/* ---------- Données de référence ---------- */
let CLUBS = [];
async function chargerClubs() {
  const { data, error } = await sb.from("clubs").select("id, nom, competition, actif").order("nom");
  if (error) throw error;
  CLUBS = data || [];
}
function nomClub(id) { const c = CLUBS.find((x) => x.id === id); return c ? c.nom : "Club ?"; }
function optionsClubs(vide, filtre) {
  return [el("option", { value: "", text: vide })].concat(
    CLUBS.filter(filtre || (() => true)).map((c) => el("option", { value: String(c.id), text: c.nom })));
}
function libelleMatch(m) { return nomClub(m.club_domicile_id) + " – " + nomClub(m.club_exterieur_id); }

async function toutLire(construire) {
  const lot = 1000; let tout = [];
  for (let d = 0; ; d += lot) {
    const { data, error } = await construire().range(d, d + lot - 1);
    if (error) throw error;
    tout = tout.concat(data || []);
    if (!data || data.length < lot) break;
  }
  return tout;
}

/* ---------- Pourquoi cette application ---------- */
const SVG_GUEPARD = "<img src=\"logo-connexion.png\" class=\"guepard-logo\" alt=\"Logo Ligue 1 : guépard et ballon\">";
function ecranPourquoi(retour) {
  racine.replaceChildren();
  const p = (t) => el("p", { text: t });
  const h = (t) => el("h2", { text: t });
  const dessin = el("div", { class: "guepard" });
  dessin.innerHTML = SVG_GUEPARD;
  racine.append(Object.assign(barreTitre("Pourquoi cette application ?", retour), { className: "barre-titre centre" }), el("section", { class: "carte pourquoi" }, [
    dessin,
    el("h1", { text: "Bienvenue sur l'application d'observation du football béninois" }),
    el("p", { class: "accroche", text: "Ensemble, identifions les talents de demain !" }),
    p("Bienvenue et merci de participer à cette démarche d'observation et de valorisation des joueurs du championnat béninois."),
    h("Pourquoi cette application ?"),
    p("Permettre aux entraîneurs, sélectionneurs, membres de la DTN et Conseillers Techniques Régionaux d'identifier et de mettre en lumière les joueurs les plus performants de chaque rencontre."),
    h("Comment ça fonctionne ?"),
    el("ul", {}, ["Sélectionnez le match auquel vous avez assisté.", "Identifiez jusqu'à 5 joueurs qui vous ont particulièrement marqué.", "Renseignez leur numéro de maillot et leurs critères d'évaluation.", "Validez et transmettez vos observations."].map((t) => el("li", { text: t }))),
    p("Chaque observateur apporte son propre regard et contribue à enrichir une base de données nationale."),
    h("À quoi ça va servir ?"),
    p("Centraliser les observations des matchs afin de constituer un véritable vivier de joueurs à potentiel pour les sélections nationales et le Programme National Élite (U23, U20, U17 et U15)."),
    p("Votre regard compte. Votre observation peut révéler un talent de demain."),
    p("Merci pour votre engagement au service du développement du football béninois."),
    el("p", { class: "conclusion", text: "Ensemble, formons aujourd'hui les Guépards de demain !" })
  ]), signature());
}

/* ---------- Connexion ---------- */
function ecranAuth() {
  racine.replaceChildren();
  const form = el("form", { novalidate: "" }, [
    el("label", { for: "ident", text: "Identifiant (nom prénom)" }),
    el("input", { id: "ident", type: "text", autocomplete: "username", autocapitalize: "words", required: "" }),
    el("label", { for: "mdp", text: "Mot de passe" }),
    el("input", { id: "mdp", type: "password", autocomplete: "current-password", required: "" }),
    el("button", { class: "btn", type: "submit", text: "Me connecter" }),
    el("button", { class: "btn btn-secondaire", type: "button", text: "Mot de passe oublié ?", onclick: () => motDePasseOublie(form) }),
    el("button", { class: "btn btn-secondaire", type: "button", text: "Pourquoi cette application ?", onclick: () => ecranPourquoi(() => ecranAuth()) })
  ]);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const ident = form.querySelector("#ident").value.trim();
    const mdp = form.querySelector("#mdp").value;
    if (ident.length < 3) return afficherMessage("Entre ton nom et prénom.", "erreur");
    if (mdp.length < 8) return afficherMessage("Le mot de passe contient au moins 8 caractères.", "erreur");
    const bouton = form.querySelector(".btn[type=submit]");
    bouton.disabled = true;
    try {
      const mail = await emailDepuisIdentifiant(ident);
      if (!mail) throw new Error("invalid login");
      const { error } = await sb.auth.signInWithPassword({ email: mail, password: mdp });
      if (error) throw error;
    } catch (err) { afficherMessage(messageErreur(err), "erreur"); bouton.disabled = false; }
  });
  racine.append(el("section", { class: "carte" }, [
    el("img", { src: "logo-connexion.png", alt: "Logo Ligue 1 : guépard et ballon", class: "logo-connexion" }),
    el("h1", { text: "Bienvenue" }),
    el("p", { class: "petit", text: "Outil d'identification des meilleurs joueurs des matchs de championnat, pour le Programme National Élite et la Sélection nationale U23 de football du Bénin." }),
    form]), signature());
}
async function motDePasseOublie(form) {
  const ident = form.querySelector("#ident").value.trim();
  if (ident.length < 3) return afficherMessage("Entre d'abord ton nom et prénom ci-dessus.", "erreur");
  try {
    const mail = await emailDepuisIdentifiant(ident);
    if (mail) {
      const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
    }
    afficherMessage("Si ce compte existe, un email de réinitialisation vient d'être envoyé.", "succes");
  } catch (err) { afficherMessage(messageErreur(err), "erreur"); }
}

/* ---------- Profil et consentement ---------- */
async function chargerProfil(id) {
  const { data, error } = await sb.from("profiles").select("id, nom, role, fonction, club_id, consentement_at").eq("id", id).single();
  if (error) throw error;
  return data;
}
function ecranConsentement(profil) {
  racine.replaceChildren();
  const champNom = el("input", { id: "nomprofil", type: "text", maxlength: "80", value: profil.nom || "", autocomplete: "name" });
  const selFonction = el("select", { id: "fonction" }, [el("option", { value: "", text: "Choisis ta fonction…" })].concat(FONCTIONS.map((f) => el("option", { value: f, text: f }))));
  if (profil.fonction) selFonction.value = profil.fonction;
  const selClub = el("select", { id: "club" }, optionsClubs("Aucun club en particulier"));
  if (profil.club_id) selClub.value = String(profil.club_id);
  const caseOk = el("input", { type: "checkbox", id: "ok" });
  const bouton = el("button", { class: "btn", type: "submit", text: "Continuer", disabled: "" });
  caseOk.addEventListener("change", () => { bouton.disabled = !caseOk.checked; });
  const info = el("div", { class: "texte-long", tabindex: "0" });
  info.innerHTML = [
    "<h3>À quoi sert cet outil</h3>",
    "<p>Après chaque match de championnat, tu peux désigner jusqu'à <strong>5 joueurs</strong> qui t'ont marqué (numéro de maillot et club), en expliquant pourquoi. Ces désignations alimentent une <strong>base de données d'identification</strong> utilisée par le staff du Programme National Élite pour suivre les joueurs et préparer les sélections (Programme National Élite, Sélection nationale U23).</p>",
    "<h3>Ce qui est enregistré</h3>",
    "<p>Ton nom, ta fonction, ton club éventuel, et chacune de tes désignations (match, club, numéro, motifs, justification). Les autres observateurs ne voient <strong>pas</strong> tes désignations ; seul le staff du programme y a accès.</p>",
    "<p>Aucune donnée n'est vendue ni utilisée pour de la publicité. Les données sont hébergées chez un prestataire technique (Supabase) dont les serveurs peuvent se trouver hors du Bénin. Tu peux demander l'accès, la correction ou la suppression de tes données à Alexandre GERBER.</p>",
    "<p class='petit'>Ce texte doit être validé par un professionnel du droit avant le déploiement officiel.</p>"
  ].join("");
  const form = el("form", {}, [
    el("h1", { text: "Avant de commencer" }),
    info,
    el("label", { for: "nomprofil", text: "Nom et prénom" }), champNom,
    el("label", { for: "fonction", text: "Fonction" }), selFonction,
    el("label", { for: "club", text: "Club (si tu es coach ou manager d'un club)" }), selClub,
    el("div", { class: "ligne-case" }, [caseOk, el("label", { for: "ok", text: "J'ai lu et j'accepte que mes désignations soient enregistrées et consultées par le staff du programme." })]),
    bouton
  ]);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const nom = champNom.value.trim();
    if (nom.length < 2) return afficherMessage("Entre ton nom et prénom.", "erreur");
    if (!selFonction.value) return afficherMessage("Choisis ta fonction.", "erreur");
    if (selFonction.value === "Coach de club" && !selClub.value) return afficherMessage("Choisis ton club.", "erreur");
    bouton.disabled = true;
    try {
      const { error } = await sb.from("profiles").update({
        nom, fonction: selFonction.value, club_id: selClub.value ? Number(selClub.value) : null,
        consentement_at: new Date().toISOString(), consentement_version: cfg.VERSION_CONSENTEMENT
      }).eq("id", profil.id);
      if (error) throw error;
      afficherMessage("Merci, ton profil est enregistré.", "succes");
      await demarrer();
    } catch (err) { afficherMessage(messageErreur(err), "erreur"); bouton.disabled = false; }
  });
  racine.append(el("section", { class: "carte" }, [form]), signature());
}

/* ---------- Accueil ---------- */
function ecranAccueil(profil) {
  racine.replaceChildren();
  const estStaff = profil.role === "staff";
  const tuile = (titre, sous, action) => el("button", { class: "tuile", type: "button", onclick: action }, [titre, el("small", { text: sous })]);
  racine.append(
    el("section", { class: "carte" }, [
      el("h1", { text: "Bonjour " + (profil.nom || "") }),
      el("span", { class: "badge" + (estStaff ? " badge-staff" : ""), text: estStaff ? "Staff du programme" : (profil.fonction || "Observateur") }),
      el("p", { class: "petit", text: estStaff ? " Consulte la base des joueurs identifiés après chaque match." : " Après un match, désigne les joueurs qui t'ont marqué (5 au maximum)." })
    ]),
    el("section", { class: "carte" }, [
      el("h2", { text: "Pourquoi cette application ?" }),
      el("div", { class: "grille" }, [tuile("Pourquoi ?", "le sens de l'application", () => ecranPourquoi(() => ecranAccueil(profil)))])
    ]),
    el("section", { class: "carte" }, [
      el("h2", { text: "Mes observations" }),
      el("div", { class: "grille" }, [
        tuile("Nouvelle observation", "après un match", () => ecranNouvelle(profil)),
        tuile("Mes désignations", "validées", () => ecranMesObservations(profil))
      ])
    ]),
    el("section", { class: "carte" }, [
      el("h2", { text: "Ligue 1 et culture foot" }),
      el("div", { class: "grille" }, [
        tuile("Ligue 1", "infos de la Ligue nationale de football", () => ecranLigue1(profil)),
        tuile("Le saviez-vous ?", "mis à jour chaque mois", () => ecranSaviez(profil))
      ])
    ]),
    estStaff ? el("section", { class: "carte" }, [
      el("h2", { text: "Base d'identification" }),
      el("div", { class: "grille" }, [
        tuile("Joueurs identifiés", "classement et détail", () => ecranBase(profil)),
        tuile("Matchs observés", "par date", () => ecranMatchs(profil)),
        tuile("Observateurs", "comptes et rôles", () => ecranObservateurs(profil)),
        tuile("Clubs", "liste modifiable", () => ecranClubs(profil))
      ])
    ]) : null,
    signature()
  );
}

/* ---------- Nouvelle observation ---------- */
function ecranNouvelle(profil) {
  racine.replaceChildren();
  const brouillon = lire(CLE_BROUILLON, null);
  const reprise = brouillon && brouillon.uid === profil.id ? brouillon : null;

  const selDom = el("select", { id: "dom" }, optionsClubs("Choisis l'équipe 1…", (c) => c.actif));
  const selExt = el("select", { id: "ext" }, optionsClubs("Choisis l'équipe 2…", (c) => c.actif));
  if (reprise) { selDom.value = reprise.dom || ""; selExt.value = reprise.ext || ""; }
  else if (profil.club_id && profil.fonction === "Coach de club") selDom.value = String(profil.club_id);
  const zoneJoueurs = el("div", { id: "joueurs" });
  const boutonAjout = el("button", { class: "btn btn-secondaire", type: "button", text: "+ Ajouter un joueur" });
  const boutonEnvoi = el("button", { class: "btn", type: "submit", text: "Valider mes désignations" });

  function clubsDuMatch() {
    return [selDom.value, selExt.value].filter(Boolean);
  }
  function majSelecteursClub() {
    for (const s of zoneJoueurs.querySelectorAll("select.club-joueur")) {
      const actuel = s.value;
      s.replaceChildren(...[el("option", { value: "", text: "Équipe du joueur…" })].concat(clubsDuMatch().map((id) => el("option", { value: id, text: nomClub(Number(id)) }))));
      s.value = clubsDuMatch().includes(actuel) ? actuel : "";
    }
  }
  function sauverBrouillon() { ecrire(CLE_BROUILLON, { uid: profil.id, ...lireFormulaire(true) }); }
  function ajouterBloc(init = {}) {
    if (zoneJoueurs.children.length >= MAX_JOUEURS) return afficherMessage("5 joueurs au maximum par match.", "info");
    const bloc = el("div", { class: "bloc-joueur" });
    const titre = el("h3", { text: "Joueur" });
    const retirer = el("button", { class: "btn-suppr", type: "button", text: "Retirer", onclick: () => { bloc.remove(); renumeroter(); sauverBrouillon(); } });
    const selClub = el("select", { class: "club-joueur", "aria-label": "Équipe du joueur" });
    const num = el("input", { class: "num-joueur", type: "number", min: "1", max: "99", inputmode: "numeric", placeholder: "N°", "aria-label": "Numéro de maillot", value: init.numero || "" });
    const motifs = el("div", { class: "motifs" }, MOTIFS.map(([k, t]) => {
      const c = el("input", { type: "checkbox", class: "motif", value: k });
      if (init.motifs && init.motifs.includes(k)) c.checked = true;
      return el("label", { class: "ligne-case" }, [c, t]);
    }));
    const just = el("textarea", { class: "just-joueur", maxlength: "500", placeholder: "Pourquoi, et comment ? (ex. : a gagné tous ses duels, deux passes décisives…)" });
    just.value = init.justification || "";
    const etr = el("input", { type: "checkbox", class: "etr-joueur" });
    if (init.etranger) etr.checked = true;
    const poste = el("select", { class: "poste-joueur", "aria-label": "Poste du joueur" }, [el("option", { value: "", text: "Poste du joueur…" })].concat(POSTES_OBS.map(([v, t]) => el("option", { value: v, text: t }))));
    if (init.poste) poste.value = init.poste;
    const apercu = el("div", { class: "petit apercu-joueur" });
    let jeton = 0;
    async function majApercu() {
      const n = Number(num.value), c = Number(selClub.value);
      apercu.textContent = "";
      if (!c || !Number.isInteger(n) || n < 1 || n > 99) return;
      const mon = ++jeton;
      const { data } = await sb.rpc("apercu_joueur", { p_club: c, p_numero: n });
      if (mon !== jeton) return;
      const j = data && data[0];
      if (j) { apercu.textContent = "→ " + j.nom + " " + j.prenom + (j.etranger ? " (" + (j.nationalite || "étranger") + ")" : ""); if (j.etranger) etr.checked = true; }
      else apercu.textContent = "Joueur non trouvé dans la liste des effectifs : vérifie le numéro et l'équipe.";
    }
    num.addEventListener("input", majApercu); selClub.addEventListener("change", majApercu);
    bloc.append(el("div", { class: "ligne-haut" }, [titre, retirer]),
      el("div", { class: "ligne-2" }, [el("div", {}, [el("label", { text: "Équipe" }), selClub]), el("div", {}, [el("label", { text: "Numéro du maillot" }), num])]),
      apercu,
      el("label", { text: "Poste du joueur" }), poste,
      el("label", { class: "ligne-case" }, [etr, "Joueur étranger"]),
      el("label", { text: "Pourquoi ce joueur ?" }), motifs, just);
    zoneJoueurs.append(bloc);
    majSelecteursClub();
    if (init.club) selClub.value = init.club;
    renumeroter();
    majApercu();
  }
  function renumeroter() {
    [...zoneJoueurs.children].forEach((b, i) => { b.querySelector("h3").textContent = "Joueur " + (i + 1); });
    boutonAjout.classList.toggle("cache", zoneJoueurs.children.length >= MAX_JOUEURS);
  }
  function lireFormulaire(brut) {
    return {
      dom: selDom.value, ext: selExt.value,
      joueurs: [...zoneJoueurs.children].map((b) => ({
        club: b.querySelector(".club-joueur").value, numero: b.querySelector(".num-joueur").value, poste: b.querySelector(".poste-joueur").value,
        etranger: b.querySelector(".etr-joueur").checked, motifs: [...b.querySelectorAll(".motif:checked")].map((c) => c.value), justification: b.querySelector(".just-joueur").value.trim()
      }))
    };
  }
  selDom.addEventListener("change", majSelecteursClub);
  selExt.addEventListener("change", majSelecteursClub);
  boutonAjout.addEventListener("click", () => { ajouterBloc(); sauverBrouillon(); });

  const form = el("form", { novalidate: "" }, [
    el("label", { for: "dom", text: "Équipe 1 (à domicile)" }), selDom,
    el("label", { for: "ext", text: "Équipe 2 (à l'extérieur)" }), selExt,
    el("h2", { text: "Joueurs qui t'ont marqué" }),
    el("p", { class: "petit", text: "5 au maximum. Ce n'est pas une obligation : si tu n'as vu qu'un ou deux bons joueurs, n'en désigne que un ou deux. Attention : une fois validées, tes désignations ne peuvent plus être modifiées ni supprimées." }),
    zoneJoueurs, boutonAjout, boutonEnvoi
  ]);
  form.addEventListener("input", sauverBrouillon);
  form.addEventListener("change", sauverBrouillon);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = lireFormulaire();
    if (!f.dom || !f.ext) return afficherMessage("Choisis les deux équipes du match.", "erreur");
    if (f.dom === f.ext) return afficherMessage("Les deux équipes doivent être différentes.", "erreur");
    if (!f.joueurs.length) return afficherMessage("Ajoute au moins un joueur.", "erreur");
    const vus = new Set();
    for (let i = 0; i < f.joueurs.length; i++) {
      const j = f.joueurs[i];
      if (!j.club) return afficherMessage("Joueur " + (i + 1) + " : choisis son équipe.", "erreur");
      const n = Number(j.numero);
      if (!Number.isInteger(n) || n < 1 || n > 99) return afficherMessage("Joueur " + (i + 1) + " : entre un numéro de maillot entre 1 et 99.", "erreur");
      if (!j.poste) return afficherMessage("Joueur " + (i + 1) + " : choisis son poste.", "erreur");
      if (!j.motifs.length) return afficherMessage("Joueur " + (i + 1) + " : coche au moins une raison.", "erreur");
      const cle = j.club + "-" + n;
      if (vus.has(cle)) return afficherMessage("Le joueur n°" + n + " de " + nomClub(Number(j.club)) + " est indiqué deux fois.", "erreur");
      vus.add(cle);
    }
    if (!confirm("Valider " + f.joueurs.length + " joueur(s) pour " + nomClub(Number(f.dom)) + " – " + nomClub(Number(f.ext)) + " ?\n\nAprès validation, tu ne pourras plus modifier ni supprimer ces désignations.")) return;
    boutonEnvoi.disabled = true;
    try {
      const dom = Number(f.dom), ext = Number(f.ext);
      let { data: trouves, error: e1 } = await sb.from("matchs").select("id").eq("club_domicile_id", dom).eq("club_exterieur_id", ext);
      if (e1) throw e1;
      let match = (trouves || [])[0];
      if (!match) {
        const { data, error } = await sb.from("matchs").insert({ club_domicile_id: dom, club_exterieur_id: ext, cree_par: profil.id }).select("id").single();
        if (error) throw error;
        match = data;
      }
      const { data: deja, error: e3 } = await sb.from("identifications").select("id").eq("match_id", match.id).eq("observateur_id", profil.id);
      if (e3) throw e3;
      if ((deja || []).length + f.joueurs.length > MAX_JOUEURS)
        throw new Error("Maximum 5 joueurs par match : tu en as déjà " + (deja || []).length + " pour ce match.");
      const lignes = f.joueurs.map((j) => ({ match_id: match.id, observateur_id: profil.id, club_id: Number(j.club), numero: Number(j.numero), etranger: !!j.etranger, poste: j.poste, motifs: j.motifs, justification: j.justification || null }));
      const { error } = await sb.from("identifications").insert(lignes);
      if (error) throw error;
      effacer(CLE_BROUILLON);
      afficherMessage(lignes.length + " joueur(s) enregistré(s). Merci !", "succes");
      ecranAccueil(profil);
    } catch (err) {
      afficherMessage(String(err.message || "").startsWith("Maximum 5 joueurs par match : tu en as") ? err.message : messageErreur(err), "erreur");
      boutonEnvoi.disabled = false;
    }
  });

  racine.append(barreTitre("Nouvelle observation", () => ecranAccueil(profil)), el("section", { class: "carte" }, [form]));
  if (reprise && reprise.joueurs && reprise.joueurs.length) {
    afficherMessage("Ton brouillon non envoyé a été restauré.", "info");
    reprise.joueurs.forEach((j) => ajouterBloc(j));
  } else ajouterBloc();
}

/* ---------- Mes désignations ---------- */
async function ecranMesObservations(profil) {
  racine.replaceChildren(barreTitre("Mes désignations", () => ecranAccueil(profil)), el("p", { class: "chargement", text: "Chargement…" }));
  try {
    const lignes = await toutLire(() => sb.from("identifications")
      .select("id, numero, poste, motifs, justification, etranger, club_id, match_id, created_at, matchs(date, club_domicile_id, club_exterieur_id)")
      .eq("observateur_id", profil.id).order("created_at", { ascending: false }));
    const carte = el("section", { class: "carte" });
    if (!lignes.length) carte.append(el("p", { class: "vide", text: "Aucune désignation pour l'instant." }));
    else carte.append(el("p", { class: "petit", text: "Désignations validées : elles ne peuvent plus être modifiées." }));
    const parMatch = new Map();
    for (const l of lignes) { if (!parMatch.has(l.match_id)) parMatch.set(l.match_id, []); parMatch.get(l.match_id).push(l); }
    const matchs = [...parMatch.values()].sort((a, b) => (b[0].created_at > a[0].created_at ? 1 : -1));
    for (const g of matchs) {
      const m = g[0].matchs;
      const bloc = el("div", { class: "obs-ligne" }, [el("strong", { text: libelleMatch(m) })]);
      for (const l of g) {
        bloc.append(el("div", { class: "ligne-haut" }, [
          el("div", {}, [el("span", { class: "numero", text: String(l.numero) }), nomClub(l.club_id) + (l.poste ? " · " + (POSTE_LIB[l.poste] || l.poste) : "") + (l.etranger ? " · étranger" : ""), el("br"),
            ...l.motifs.map((k) => el("span", { class: "puce", text: MOTIFS_COURT[k] || k })),
            l.justification ? el("div", { class: "petit", text: l.justification }) : ""])
        ]));
      }
      carte.append(bloc);
    }
    racine.replaceChildren(barreTitre("Mes désignations", () => ecranAccueil(profil)), carte);
  } catch (err) { racine.replaceChildren(barreTitre("Mes désignations", () => ecranAccueil(profil)), el("p", { class: "avertissement", text: messageErreur(err) })); }
}

/* ---------- Staff : base des joueurs identifiés ---------- */
let BASE = null; // cache des lignes de la base pendant la session
async function chargerBase() {
  const [lignes, refs] = await Promise.all([
    toutLire(() => sb.from("identifications")
      .select("id, numero, poste, motifs, justification, club_id, observateur_id, match_id, created_at, etranger, matchs(date, club_domicile_id, club_exterieur_id), profiles(nom, fonction)")
      .order("created_at", { ascending: false })),
    toutLire(() => sb.from("joueurs_ref").select("id, club_id, numero, nom, prenom, poste, date_naissance, nationalite, etranger, notes").order("id"))
  ]);
  BASE = { lignes, refs };
  return BASE;
}
function posteDe(lignes, ref) {
  const n = {};
  for (const l of lignes) if (l.poste) n[l.poste] = (n[l.poste] || 0) + 1;
  const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : (ref && ref.poste) || "";
}
function nomJoueur(ref) { return ref ? (ref.nom + " " + (ref.prenom || "")).trim() : ""; }
function refDe(club, numero) { return BASE.refs.find((r) => r.club_id === club && r.numero === numero); }

async function ecranBase(profil) {
  racine.replaceChildren(barreTitre("Joueurs identifiés", () => ecranAccueil(profil)), el("p", { class: "chargement", text: "Chargement…" }));
  try { await chargerBase(); } catch (err) { return racine.replaceChildren(barreTitre("Joueurs identifiés", () => ecranAccueil(profil)), el("p", { class: "avertissement", text: messageErreur(err) })); }

  const selPeriode = el("select", {}, [["tout", "Toute la saison"], ["30", "30 derniers jours"], ["90", "90 derniers jours"]].map(([v, t]) => el("option", { value: v, text: t })));
  const selClub = el("select", {}, optionsClubs("Tous les clubs"));
  const selFonction = el("select", {}, [el("option", { value: "", text: "Toutes les fonctions" })].concat(FONCTIONS.map((f) => el("option", { value: f, text: f }))));
  const champRecherche = el("input", { type: "search", placeholder: "Nom ou numéro…" });
  const selPoste = el("select", {}, [el("option", { value: "", text: "Tous les postes" })].concat(POSTES_OBS.map(([v, t]) => el("option", { value: v, text: t }))));
  const naissDe = el("input", { type: "date", "aria-label": "Né à partir du" });
  const naissA = el("input", { type: "date", "aria-label": "Né jusqu'au" });
  const zoneListe = el("div");
  const resume = el("p", { class: "petit" });

  function afficher() {
    const limite = selPeriode.value === "tout" ? "" : dateLocale(new Date(Date.now() - Number(selPeriode.value) * 86400000));
    const q = champRecherche.value.trim().toLowerCase();
    const groupes = new Map();
    for (const l of BASE.lignes) {
      if (limite && l.created_at.slice(0, 10) < limite) continue;
      if (selClub.value && String(l.club_id) !== selClub.value) continue;
      if (selFonction.value && (!l.profiles || l.profiles.fonction !== selFonction.value)) continue;
      const cle = l.club_id + "-" + l.numero;
      if (!groupes.has(cle)) groupes.set(cle, { club: l.club_id, numero: l.numero, lignes: [] });
      groupes.get(cle).lignes.push(l);
    }
    let liste = [...groupes.values()].map((g) => ({
      ...g, ref: refDe(g.club, g.numero), poste: posteDe(g.lignes, refDe(g.club, g.numero)), votes: g.lignes.length,
      obs: new Set(g.lignes.map((x) => x.observateur_id)).size, matchs: new Set(g.lignes.map((x) => x.match_id)).size,
      derniere: g.lignes.reduce((m, x) => (x.created_at.slice(0, 10) > m ? x.created_at.slice(0, 10) : m), "")
    }));
    if (q) liste = liste.filter((g) => String(g.numero) === q || (g.ref && nomJoueur(g.ref).toLowerCase().includes(q)) || nomClub(g.club).toLowerCase().includes(q));
    if (selPoste.value) liste = liste.filter((g) => g.poste && (g.poste === selPoste.value || (!POSTE_LIB[g.poste.toLowerCase()] && false) || (["GB", "DEF", "MIL", "ATT"].includes(g.poste) && POSTE_GROUPE[g.poste] === POSTE_GROUPE[selPoste.value])));
    if (naissDe.value || naissA.value) liste = liste.filter((g) => { const d = g.ref && g.ref.date_naissance; return d && (!naissDe.value || d >= naissDe.value) && (!naissA.value || d <= naissA.value); });
    liste.sort((a, b) => b.obs - a.obs || b.votes - a.votes || (b.derniere > a.derniere ? 1 : -1));
    resume.textContent = liste.length + " joueur(s) identifié(s) · " + liste.reduce((s, g) => s + g.votes, 0) + " désignation(s)";
    zoneListe.replaceChildren(...(liste.length ? liste.map((g) => el("button", { class: "ligne-athlete", type: "button", onclick: () => ecranJoueur(profil, g.club, g.numero) }, [
      el("div", { class: "ligne-haut" }, [
        el("div", {}, [el("span", { class: "numero", text: String(g.numero) }), el("strong", { text: g.ref ? nomJoueur(g.ref) : "Joueur hors liste" }),
          el("div", { class: "petit", text: nomClub(g.club) + " · dossard " + g.numero + (g.poste ? " · " + (POSTE_LIB[g.poste] || g.poste) : "") + (g.ref && g.ref.date_naissance ? " · né le " + jfr(g.ref.date_naissance) : "") + (g.ref && g.ref.etranger ? " · étranger" + (g.ref.nationalite ? " (" + g.ref.nationalite + ")" : "") : (!g.ref && g.lignes.some((x) => x.etranger) ? " · étranger" : "")) })]),
        el("span", { class: "pastille-niv niv-vert", text: g.votes + (g.votes > 1 ? " votes" : " vote") })]),
      el("div", { class: "petit", text: g.obs + " observateur(s) · " + g.matchs + " match(s) · dernier : " + jfr(g.derniere) })
    ])) : [el("p", { class: "vide", text: "Aucun joueur pour ces filtres." })]));
  }
  [selPeriode, selClub, selFonction, selPoste, naissDe, naissA].forEach((s) => s.addEventListener("change", afficher));
  champRecherche.addEventListener("input", afficher);

  const exporter = el("button", { class: "btn btn-secondaire", type: "button", text: "Exporter en CSV (Excel)", onclick: exporterCsv });
  racine.replaceChildren(barreTitre("Joueurs identifiés", () => ecranAccueil(profil)), el("section", { class: "carte" }, [
    el("div", { class: "filtres" }, [
      el("div", {}, [el("label", { text: "Période" }), selPeriode]), el("div", {}, [el("label", { text: "Club" }), selClub]),
      el("div", {}, [el("label", { text: "Fonction de l'observateur" }), selFonction]), el("div", {}, [el("label", { text: "Poste" }), selPoste]),
      el("div", {}, [el("label", { text: "Né à partir du" }), naissDe]), el("div", {}, [el("label", { text: "Né jusqu'au" }), naissA]),
      el("div", {}, [el("label", { text: "Recherche" }), champRecherche])]),
    resume, zoneListe, exporter]));
  afficher();
}

function exporterCsv() {
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const entete = ["Date d'enregistrement", "Équipe 1 (domicile)", "Équipe 2 (extérieur)", "Club du joueur", "Dossard", "Nom", "Prénom", "Poste", "Date de naissance", "Étranger", "Nationalité", "Raisons", "Justification", "Observateur", "Fonction"];
  const lignes = BASE.lignes.map((l) => {
    const r = refDe(l.club_id, l.numero);
    return [jfr(l.created_at.slice(0, 10)), nomClub(l.matchs.club_domicile_id), nomClub(l.matchs.club_exterieur_id), nomClub(l.club_id), l.numero,
      r ? r.nom : "", r ? r.prenom || "" : "", l.poste ? (POSTE_LIB[l.poste] || l.poste) : (r && r.poste ? POSTE_LIB[r.poste] || r.poste : ""), r && r.date_naissance ? jfr(r.date_naissance) : "", (r && r.etranger) || l.etranger ? "oui" : "non", r && r.nationalite ? r.nationalite : "", l.motifs.map((k) => MOTIFS_COURT[k] || k).join(" + "), l.justification || "",
      l.profiles ? l.profiles.nom : "", l.profiles ? l.profiles.fonction || "" : ""].map(cell).join(";");
  });
  const blob = new Blob(["﻿" + [entete.map(cell).join(";")].concat(lignes).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "joueurs_identifies_" + dateLocale() + ".csv" });
  document.body.append(a); a.click(); a.remove();
  afficherMessage("Export prêt : " + lignes.length + " ligne(s).", "succes");
}

async function ecranJoueur(profil, club, numero) {
  const lignes = BASE.lignes.filter((l) => l.club_id === club && l.numero === numero);
  const ref = refDe(club, numero);
  const champNom = el("input", { id: "ref-nom", type: "text", maxlength: "80", value: ref ? ref.nom : "" });
  const champPrenom = el("input", { id: "ref-prenom", type: "text", maxlength: "80", value: ref ? ref.prenom || "" : "" });
  const champNat = el("input", { id: "ref-nat", type: "text", maxlength: "40", placeholder: "vide si béninois", value: ref && ref.nationalite ? ref.nationalite : "" });
  const selPoste = el("select", { id: "ref-poste" }, POSTES.map(([v, t]) => el("option", { value: v, text: t })));
  selPoste.value = ref && ref.poste ? ref.poste : "";
  const champNaiss = el("input", { id: "ref-naiss", type: "date", value: ref && ref.date_naissance ? ref.date_naissance : "" });
  const champNotes = el("textarea", { id: "ref-notes", maxlength: "500", placeholder: "Notes du staff (facultatif)" });
  champNotes.value = ref && ref.notes ? ref.notes : "";
  const enreg = el("button", { class: "btn", type: "submit", text: "Enregistrer la fiche" });
  const form = el("form", {}, [
    el("label", { for: "ref-nom", text: "Nom" }), champNom,
    el("label", { for: "ref-prenom", text: "Prénom" }), champPrenom,
    el("label", { for: "ref-nat", text: "Nationalité étrangère" }), champNat,
    el("label", { for: "ref-poste", text: "Poste" }), selPoste,
    el("label", { for: "ref-naiss", text: "Date de naissance" }), champNaiss,
    el("label", { for: "ref-notes", text: "Notes" }), champNotes, enreg]);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    enreg.disabled = true;
    try {
      const { error } = await sb.from("joueurs_ref").upsert({ club_id: club, numero, nom: champNom.value.trim(), prenom: champPrenom.value.trim(), nationalite: champNat.value.trim() || null, etranger: !!champNat.value.trim(), poste: selPoste.value || null, date_naissance: champNaiss.value || null, notes: champNotes.value.trim() || null }, { onConflict: "club_id,numero" });
      if (error) throw error;
      await chargerBase();
      afficherMessage("Fiche enregistrée.", "succes");
      ecranJoueur(profil, club, numero);
    } catch (err) { afficherMessage(messageErreur(err), "erreur"); enreg.disabled = false; }
  });
  const detail = lignes.slice().sort((a, b) => (b.created_at > a.created_at ? 1 : -1)).map((l) => el("div", { class: "obs-ligne" }, [
    el("strong", { text: jfr(l.created_at.slice(0, 10)) + " · " + libelleMatch(l.matchs) }),
    el("div", { class: "petit", text: (l.profiles ? l.profiles.nom : "Observateur") + (l.profiles && l.profiles.fonction ? " (" + l.profiles.fonction + ")" : "") }),
    el("div", {}, l.motifs.map((k) => el("span", { class: "puce", text: MOTIFS_COURT[k] || k }))),
    l.justification ? el("div", { text: l.justification }) : ""]));
  racine.replaceChildren(barreTitre("N°" + numero + " · " + nomClub(club), () => ecranBase(profil)),
    el("section", { class: "carte" }, [el("h2", { text: "Fiche du joueur" }), form]),
    el("section", { class: "carte" }, [el("h2", { text: lignes.length + " désignation(s)" })].concat(detail)));
}

/* ---------- Staff : matchs, observateurs, clubs ---------- */
async function ecranMatchs(profil) {
  racine.replaceChildren(barreTitre("Matchs observés", () => ecranAccueil(profil)), el("p", { class: "chargement", text: "Chargement…" }));
  try {
    await chargerBase();
    const par = new Map();
    for (const l of BASE.lignes) {
      if (!par.has(l.match_id)) par.set(l.match_id, { m: l.matchs, n: 0, obs: new Set() });
      const g = par.get(l.match_id); g.n++; g.obs.add(l.observateur_id);
    }
    const liste = [...par.values()].sort((a, b) => (b.m.date > a.m.date ? 1 : -1));
    racine.replaceChildren(barreTitre("Matchs observés", () => ecranAccueil(profil)), el("section", { class: "carte" },
      liste.length ? liste.map((g) => el("div", { class: "obs-ligne" }, [el("strong", { text: libelleMatch(g.m) }),
        el("div", { class: "petit", text: g.obs.size + " observateur(s) · " + g.n + " désignation(s)" })]))
        : [el("p", { class: "vide", text: "Aucun match observé pour l'instant." })]));
  } catch (err) { racine.replaceChildren(barreTitre("Matchs observés", () => ecranAccueil(profil)), el("p", { class: "avertissement", text: messageErreur(err) })); }
}

async function ecranObservateurs(profil) {
  racine.replaceChildren(barreTitre("Observateurs", () => ecranAccueil(profil)), el("p", { class: "chargement", text: "Chargement…" }));
  try {
    const [pf, ids] = await Promise.all([
      toutLire(() => sb.from("profiles").select("id, nom, role, fonction, club_id, consentement_at").order("nom")),
      toutLire(() => sb.from("identifications").select("id, observateur_id").order("id"))]);
    const compte = new Map(); for (const i of ids) compte.set(i.observateur_id, (compte.get(i.observateur_id) || 0) + 1);
    const carte = el("section", { class: "carte" }, [el("p", { class: "petit", text: "Les comptes se créent dans Supabase (Authentication → Users → Add user). Un nouvel utilisateur renseigne son nom et sa fonction à sa première connexion." })]);
    for (const p of pf) {
      const estMoi = p.id === profil.id;
      carte.append(el("div", { class: "obs-ligne" }, [el("div", { class: "ligne-haut" }, [
        el("div", {}, [el("strong", { text: p.nom || "(profil à compléter)" }), el("div", { class: "petit", text: [p.fonction, p.club_id ? nomClub(p.club_id) : "", (compte.get(p.id) || 0) + " désignation(s)"].filter(Boolean).join(" · ") })]),
        el("div", {}, [el("span", { class: "badge" + (p.role === "staff" ? " badge-staff" : ""), text: p.role === "staff" ? "Staff" : "Observateur" }),
          estMoi ? "" : el("button", { class: "btn btn-secondaire", type: "button", text: p.role === "staff" ? "Retirer staff" : "Passer staff", onclick: async () => {
            if (!confirm((p.role === "staff" ? "Retirer l'accès staff à " : "Donner l'accès à la base d'identification à ") + (p.nom || "ce compte") + " ?")) return;
            const { error } = await sb.from("profiles").update({ role: p.role === "staff" ? "observateur" : "staff" }).eq("id", p.id);
            if (error) return afficherMessage(messageErreur(error), "erreur");
            afficherMessage("Rôle modifié.", "succes"); ecranObservateurs(profil);
          } })])])]));
    }
    racine.replaceChildren(barreTitre("Observateurs", () => ecranAccueil(profil)), carte);
  } catch (err) { racine.replaceChildren(barreTitre("Observateurs", () => ecranAccueil(profil)), el("p", { class: "avertissement", text: messageErreur(err) })); }
}

async function ecranClubs(profil) {
  racine.replaceChildren(barreTitre("Clubs", () => ecranAccueil(profil)), el("p", { class: "chargement", text: "Chargement…" }));
  try { await chargerClubs(); } catch (err) { return racine.replaceChildren(barreTitre("Clubs", () => ecranAccueil(profil)), el("p", { class: "avertissement", text: messageErreur(err) })); }
  const champNom = el("input", { id: "club-nom", type: "text", maxlength: "60", placeholder: "Nom du club" });
  const champComp = el("input", { id: "club-comp", type: "text", maxlength: "60", value: "Celtiis Ligue 1" });
  const formAjout = el("form", {}, [el("h2", { text: "Ajouter un club" }), el("label", { for: "club-nom", text: "Nom" }), champNom, el("label", { for: "club-comp", text: "Compétition" }), champComp,
    el("button", { class: "btn", type: "submit", text: "Ajouter" })]);
  formAjout.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (champNom.value.trim().length < 2) return afficherMessage("Entre le nom du club.", "erreur");
    const { error } = await sb.from("clubs").insert({ nom: champNom.value.trim(), competition: champComp.value.trim() || "Celtiis Ligue 1" });
    if (error) return afficherMessage(String(error.message).includes("duplicate") ? "Ce club existe déjà." : messageErreur(error), "erreur");
    afficherMessage("Club ajouté.", "succes"); ecranClubs(profil);
  });
  const carte = el("section", { class: "carte" }, [el("h2", { text: CLUBS.length + " club(s)" })].concat(CLUBS.map((c) => el("div", { class: "obs-ligne" }, [el("div", { class: "ligne-haut" }, [
    el("div", {}, [el("strong", { text: c.nom }), el("div", { class: "petit", text: c.competition + (c.actif ? "" : " · masqué") })]),
    el("button", { class: "btn btn-secondaire", type: "button", text: c.actif ? "Masquer" : "Réactiver", onclick: async () => {
      const { error } = await sb.from("clubs").update({ actif: !c.actif }).eq("id", c.id);
      if (error) return afficherMessage(messageErreur(error), "erreur");
      ecranClubs(profil);
    } })])]))));
  racine.replaceChildren(barreTitre("Clubs", () => ecranAccueil(profil)), el("section", { class: "carte" }, [formAjout]), carte);
}

/* ---------- Ligue 1 : informations complémentaires ---------- */
function paragraphes(texte) {
  const bloc = el("div", { class: "texte-info" });
  for (const p of String(texte || "").split(/\n{2,}/)) {
    const t = p.trim(); if (!t) continue;
    if (t.startsWith("## ")) bloc.append(el("h3", { text: t.slice(3) }));
    else bloc.append(el("p", { text: t }));
  }
  return bloc;
}
async function lireInfo(cle) {
  const { data, error } = await sb.from("infos").select("cle, titre, contenu, maj").eq("cle", cle).maybeSingle();
  if (error) throw error;
  return data || { cle, contenu: "", maj: null };
}
async function ecranSaviez(profil) {
  const retour = () => ecranAccueil(profil);
  racine.replaceChildren(barreTitre("Le saviez-vous ?", retour), el("p", { class: "chargement", text: "Chargement…" }));
  try {
    const info = await lireInfo("saviez_vous");
    const carte = el("section", { class: "carte" });
    if (info.contenu && info.contenu.trim()) {
      carte.append(paragraphes(info.contenu), el("p", { class: "petit", text: "Mise à jour le " + jfr(String(info.maj).slice(0, 10)) + " · contenu actualisé une fois par mois." }));
    } else carte.append(el("p", { class: "vide", text: "Le contenu de ce mois arrive bientôt." }));
    const cartes = [carte];
    if (profil.role === "staff") cartes.push(editeurInfo("saviez_vous", info, "Modifier le texte du mois", () => ecranSaviez(profil)));
    racine.replaceChildren(barreTitre("Le saviez-vous ?", retour), ...cartes, signature());
  } catch (err) { racine.replaceChildren(barreTitre("Le saviez-vous ?", retour), el("p", { class: "avertissement", text: messageErreur(err) })); }
}
function editeurInfo(cle, info, titre, apres) {
  const zone = el("textarea", { class: "zone-info", maxlength: "20000", rows: "10", placeholder: "Un paragraphe = une ligne vide entre deux textes. Titre : commence la ligne par ## " });
  zone.value = info.contenu || "";
  const bouton = el("button", { class: "btn", type: "submit", text: "Enregistrer" });
  const form = el("form", {}, [el("h2", { text: titre }), zone, bouton]);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault(); bouton.disabled = true;
    try {
      const { error } = await sb.from("infos").upsert({ cle, titre: info.titre || cle, contenu: zone.value.trim(), maj: new Date().toISOString() }, { onConflict: "cle" });
      if (error) throw error;
      afficherMessage("Enregistré.", "succes"); apres();
    } catch (err) { afficherMessage(messageErreur(err), "erreur"); bouton.disabled = false; }
  });
  return el("section", { class: "carte" }, [form]);
}
const RUBRIQUES_L1 = [
  ["buts", "Meilleurs buteurs", "buts"], ["passes", "Meilleurs passeurs", "passes déc."], ["jaunes", "Cartons jaunes", "jaunes"],
  ["rouges", "Cartons rouges", "rouges"], ["minutes", "Temps de jeu", "min"], ["blessure", "Blessures", ""]
];
async function ecranLigue1(profil) {
  const retour = () => ecranAccueil(profil);
  racine.replaceChildren(barreTitre("Ligue 1", retour), el("p", { class: "chargement", text: "Chargement…" }));
  try {
    const [stats, refs, info] = await Promise.all([
      toutLire(() => sb.from("stats_joueurs").select("club_id, numero, buts, passes, jaunes, rouges, minutes, blessure, maj").order("club_id")),
      toutLire(() => sb.from("joueurs_ref").select("club_id, numero, nom, prenom").order("id")),
      lireInfo("ligue1_info")
    ]);
    const nom = (c, n) => { const r = refs.find((x) => x.club_id === c && x.numero === n); return r ? (r.nom + " " + (r.prenom || "")).trim() : "N°" + n; };
    const selRub = el("select", {}, RUBRIQUES_L1.map(([v, t]) => el("option", { value: v, text: t })));
    const zone = el("div");
    const dernier = stats.reduce((m, s) => (s.maj > m ? s.maj : m), "");
    function afficher() {
      const [cle, , unite] = RUBRIQUES_L1.find((r) => r[0] === selRub.value);
      let lignes;
      if (cle === "blessure") lignes = stats.filter((s) => s.blessure && s.blessure.trim());
      else lignes = stats.filter((s) => s[cle] > 0).sort((a, b) => b[cle] - a[cle]).slice(0, 20);
      zone.replaceChildren(...(lignes.length ? lignes.map((s, i) => el("div", { class: "obs-ligne" }, [el("div", { class: "ligne-haut" }, [
        el("div", {}, [el("strong", { text: (cle === "blessure" ? "" : (i + 1) + ". ") + nom(s.club_id, s.numero) }), el("div", { class: "petit", text: nomClub(s.club_id) + (cle === "blessure" ? " · " + s.blessure : "") })]),
        cle === "blessure" ? "" : el("span", { class: "pastille-niv niv-vert", text: s[cle] + " " + unite })])]))
        : [el("p", { class: "vide", text: "Aucune donnée saisie pour le moment." })]));
    }
    selRub.addEventListener("change", afficher);
    const carteInfo = info.contenu && info.contenu.trim() ? [el("section", { class: "carte" }, [paragraphes(info.contenu)])] : [];
    const cartes = [
      ...carteInfo,
      el("section", { class: "carte" }, [el("p", { class: "petit", text: "Source : informations de la Ligue nationale de football." }), el("label", { text: "Classement" }), selRub, zone,
        el("p", { class: "petit", text: dernier ? "Informations de la Ligue nationale de football · dernière mise à jour le " + jfr(dernier.slice(0, 10)) + "." : "Informations de la Ligue nationale de football, saisies par le staff du programme." })])
    ];
    if (profil.role === "staff") {
      cartes.push(editeurInfo("ligue1_info", info, "Texte d'introduction Ligue 1", () => ecranLigue1(profil)));
      cartes.push(el("section", { class: "carte" }, [el("h2", { text: "Saisir les statistiques" }), el("p", { class: "petit", text: "Choisis un club, renseigne les chiffres de ses joueurs, puis enregistre." }),
        el("button", { class: "btn btn-secondaire", type: "button", text: "Ouvrir la saisie", onclick: () => ecranSaisieStats(profil) })]));
    }
    racine.replaceChildren(barreTitre("Ligue 1", retour), ...cartes, signature());
    afficher();
  } catch (err) { racine.replaceChildren(barreTitre("Ligue 1", retour), el("p", { class: "avertissement", text: messageErreur(err) })); }
}
async function ecranSaisieStats(profil) {
  const retour = () => ecranLigue1(profil);
  racine.replaceChildren(barreTitre("Saisie des statistiques", retour), el("p", { class: "chargement", text: "Chargement…" }));
  try {
    const [stats, refs] = await Promise.all([
      toutLire(() => sb.from("stats_joueurs").select("club_id, numero, buts, passes, jaunes, rouges, minutes, blessure").order("club_id")),
      toutLire(() => sb.from("joueurs_ref").select("club_id, numero, nom, prenom").order("numero"))
    ]);
    const selClub = el("select", {}, optionsClubs("Choisis un club…", (c) => c.actif));
    const zone = el("div");
    const champs = ["buts", "passes", "jaunes", "rouges", "minutes"];
    const entetes = { buts: "Buts", passes: "Passes déc.", jaunes: "Jaunes", rouges: "Rouges", minutes: "Minutes" };
    function afficher() {
      zone.replaceChildren();
      const club = Number(selClub.value); if (!club) return;
      const joueurs = refs.filter((r) => r.club_id === club).sort((a, b) => a.numero - b.numero);
      if (!joueurs.length) return zone.append(el("p", { class: "vide", text: "Aucun joueur dans l'effectif de ce club." }));
      const lignes = joueurs.map((j) => {
        const s = stats.find((x) => x.club_id === club && x.numero === j.numero) || {};
        const ins = champs.map((c) => el("input", { type: "number", min: "0", inputmode: "numeric", class: "stat-in", "aria-label": entetes[c], value: s[c] || 0 }));
        const bl = el("input", { type: "text", maxlength: "120", class: "stat-bl", placeholder: "Blessure (laisser vide si aucune)", value: s.blessure || "" });
        zone.append(el("div", { class: "obs-ligne" }, [el("strong", { text: "N°" + j.numero + " " + (j.nom + " " + (j.prenom || "")).trim() }),
          el("div", { class: "stat-grille" }, ins.map((i, k) => el("label", { class: "petit" }, [entetes[champs[k]], i]))), bl]));
        return { numero: j.numero, ins, bl };
      });
      const bouton = el("button", { class: "btn", type: "button", text: "Enregistrer ce club" });
      bouton.addEventListener("click", async () => {
        bouton.disabled = true;
        try {
          const rows = lignes.map((l) => {
            const o = { club_id: club, numero: l.numero, blessure: l.bl.value.trim() || null, maj: new Date().toISOString() };
            champs.forEach((c, k) => { o[c] = Math.max(0, parseInt(l.ins[k].value, 10) || 0); });
            return o;
          });
          const { error } = await sb.from("stats_joueurs").upsert(rows, { onConflict: "club_id,numero" });
          if (error) throw error;
          afficherMessage("Statistiques enregistrées pour " + nomClub(club) + ".", "succes");
          ecranLigue1(profil);
        } catch (err) { afficherMessage(messageErreur(err), "erreur"); bouton.disabled = false; }
      });
      zone.append(bouton);
    }
    selClub.addEventListener("change", afficher);
    racine.replaceChildren(barreTitre("Saisie des statistiques", retour), el("section", { class: "carte" }, [el("label", { text: "Club" }), selClub, zone]));
  } catch (err) { racine.replaceChildren(barreTitre("Saisie des statistiques", retour), el("p", { class: "avertissement", text: messageErreur(err) })); }
}

/* ---------- Démarrage ---------- */
async function demarrer() {
  if (!sb) return;
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { boutonDeconnexion.classList.add("cache"); return ecranAuth(); }
    boutonDeconnexion.classList.remove("cache");
    await chargerClubs();
    const profil = await chargerProfil(session.user.id);
    if (!profil.consentement_at || !profil.nom || !profil.fonction) return ecranConsentement(profil);
    ecranAccueil(profil);
  } catch (err) {
    racine.replaceChildren(el("div", { class: "carte" }, [el("h2", { text: "Impossible de charger tes données" }), el("p", { text: messageErreur(err) }),
      el("button", { class: "btn", type: "button", text: "Réessayer", onclick: demarrer })]));
  }
}
boutonDeconnexion.addEventListener("click", async () => {
  try { await sb.auth.signOut({ scope: "local" }); } catch (e) { /* session déjà effacée */ }
  BASE = null; await demarrer();
});
if (sb) sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_IN" || evt === "SIGNED_OUT" || evt === "PASSWORD_RECOVERY") setTimeout(demarrer, 0); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
demarrer();
