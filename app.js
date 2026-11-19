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
function signature() { return el("p", { class: "signature", text: "Concepteur : Alexandre GERBER" }); }

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
const SVG_GUEPARD = '<svg viewBox="0 0 220 180" role="img" aria-label="Tête de guépard avec un ballon de football" xmlns="http://www.w3.org/2000/svg">'
  + '<circle cx="52" cy="42" r="17" fill="#E3A52B"/><circle cx="52" cy="42" r="8" fill="#3b2a14"/>'
  + '<circle cx="148" cy="42" r="17" fill="#E3A52B"/><circle cx="148" cy="42" r="8" fill="#3b2a14"/>'
  + '<ellipse cx="100" cy="88" rx="64" ry="56" fill="#F2BB3C"/>'
  + '<g fill="#3b2a14" opacity=".85"><circle cx="82" cy="46" r="3"/><circle cx="100" cy="40" r="3"/><circle cx="118" cy="46" r="3"/><circle cx="64" cy="62" r="2.6"/><circle cx="136" cy="62" r="2.6"/><circle cx="52" cy="88" r="2.6"/><circle cx="148" cy="88" r="2.6"/><circle cx="60" cy="108" r="2.4"/><circle cx="140" cy="108" r="2.4"/><circle cx="92" cy="54" r="2.2"/><circle cx="108" cy="54" r="2.2"/></g>'
  + '<ellipse cx="100" cy="112" rx="30" ry="21" fill="#FBE8B4"/>'
  + '<path d="M74 84 Q64 106 78 126 M126 84 Q136 106 122 126" fill="none" stroke="#3b2a14" stroke-width="5" stroke-linecap="round"/>'
  + '<circle cx="76" cy="80" r="8" fill="#fff"/><circle cx="124" cy="80" r="8" fill="#fff"/><circle cx="77" cy="81" r="5" fill="#3b2a14"/><circle cx="123" cy="81" r="5" fill="#3b2a14"/><circle cx="79" cy="79" r="1.6" fill="#fff"/><circle cx="125" cy="79" r="1.6" fill="#fff"/>'
  + '<path d="M91 98 L109 98 L100 108 Z" fill="#3b2a14"/><path d="M100 108 V116 M88 120 Q100 128 112 120" fill="none" stroke="#3b2a14" stroke-width="3" stroke-linecap="round"/>'
  + '<circle cx="166" cy="140" r="30" fill="#fff" stroke="#1c1c1c" stroke-width="3"/>'
  + '<polygon points="166,125 179,134 174,149 158,149 153,134" fill="#1c1c1c"/>'
  + '<g stroke="#1c1c1c" stroke-width="3" stroke-linecap="round"><path d="M166 125 V112 M179 134 L190 128 M174 149 L182 160 M158 149 L150 160 M153 134 L142 128"/></g>'
  + '<path d="M20 172 H200" stroke="#008751" stroke-width="5" stroke-linecap="round"/><path d="M20 172 H80" stroke="#FCD116" stroke-width="5" stroke-linecap="round" opacity="0"/>'
  + '</svg>';
function ecranPourquoi(retour) {
  racine.replaceChildren();
  const p = (t) => el("p", { text: t });
  const h = (t) => el("h2", { text: t });
  const dessin = el("div", { class: "guepard" });
  dessin.innerHTML = SVG_GUEPARD;
  racine.append(barreTitre("Pourquoi cette application ?", retour), el("section", { class: "carte pourquoi" }, [
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
      el("h2", { text: "Mes observations" }),
      el("div", { class: "grille" }, [
        tuile("Nouvelle observation", "après un match", () => ecranNouvelle(profil)),
        tuile("Mes désignations", "validées", () => ecranMesObservations(profil)),
        tuile("Pourquoi ?", "le sens de l'application", () => ecranPourquoi(() => ecranAccueil(profil)))
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
        club: b.querySelector(".club-joueur").value, numero: b.querySelector(".num-joueur").value,
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
      const lignes = f.joueurs.map((j) => ({ match_id: match.id, observateur_id: profil.id, club_id: Number(j.club), numero: Number(j.numero), etranger: !!j.etranger, motifs: j.motifs, justification: j.justification || null }));
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
      .select("id, numero, motifs, justification, etranger, club_id, match_id, created_at, matchs(date, club_domicile_id, club_exterieur_id)")
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
          el("div", {}, [el("span", { class: "numero", text: String(l.numero) }), nomClub(l.club_id) + (l.etranger ? " · étranger" : ""), el("br"),
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
      .select("id, numero, motifs, justification, club_id, observateur_id, match_id, created_at, etranger, matchs(date, club_domicile_id, club_exterieur_id), profiles(nom, fonction)")
      .order("created_at", { ascending: false })),
    toutLire(() => sb.from("joueurs_ref").select("id, club_id, numero, nom, prenom, poste, date_naissance, nationalite, etranger, notes").order("id"))
  ]);
  BASE = { lignes, refs };
  return BASE;
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
      ...g, ref: refDe(g.club, g.numero), votes: g.lignes.length,
      obs: new Set(g.lignes.map((x) => x.observateur_id)).size, matchs: new Set(g.lignes.map((x) => x.match_id)).size,
      derniere: g.lignes.reduce((m, x) => (x.created_at.slice(0, 10) > m ? x.created_at.slice(0, 10) : m), "")
    }));
    if (q) liste = liste.filter((g) => String(g.numero) === q || (g.ref && nomJoueur(g.ref).toLowerCase().includes(q)) || nomClub(g.club).toLowerCase().includes(q));
    liste.sort((a, b) => b.obs - a.obs || b.votes - a.votes || (b.derniere > a.derniere ? 1 : -1));
    resume.textContent = liste.length + " joueur(s) identifié(s) · " + liste.reduce((s, g) => s + g.votes, 0) + " désignation(s)";
    zoneListe.replaceChildren(...(liste.length ? liste.map((g) => el("button", { class: "ligne-athlete", type: "button", onclick: () => ecranJoueur(profil, g.club, g.numero) }, [
      el("div", { class: "ligne-haut" }, [
        el("div", {}, [el("span", { class: "numero", text: String(g.numero) }), el("strong", { text: g.ref ? nomJoueur(g.ref) : "Joueur hors liste" }),
          el("div", { class: "petit", text: nomClub(g.club) + " · dossard " + g.numero + (g.ref && g.ref.date_naissance ? " · né le " + jfr(g.ref.date_naissance) : "") + (g.ref && g.ref.etranger ? " · étranger" + (g.ref.nationalite ? " (" + g.ref.nationalite + ")" : "") : (!g.ref && g.lignes.some((x) => x.etranger) ? " · étranger" : "")) })]),
        el("span", { class: "pastille-niv niv-vert", text: g.votes + (g.votes > 1 ? " votes" : " vote") })]),
      el("div", { class: "petit", text: g.obs + " observateur(s) · " + g.matchs + " match(s) · dernier : " + jfr(g.derniere) })
    ])) : [el("p", { class: "vide", text: "Aucun joueur pour ces filtres." })]));
  }
  [selPeriode, selClub, selFonction].forEach((s) => s.addEventListener("change", afficher));
  champRecherche.addEventListener("input", afficher);

  const exporter = el("button", { class: "btn btn-secondaire", type: "button", text: "Exporter en CSV (Excel)", onclick: exporterCsv });
  racine.replaceChildren(barreTitre("Joueurs identifiés", () => ecranAccueil(profil)), el("section", { class: "carte" }, [
    el("div", { class: "filtres" }, [
      el("div", {}, [el("label", { text: "Période" }), selPeriode]), el("div", {}, [el("label", { text: "Club" }), selClub]),
      el("div", {}, [el("label", { text: "Fonction de l'observateur" }), selFonction]), el("div", {}, [el("label", { text: "Recherche" }), champRecherche])]),
    resume, zoneListe, exporter]));
  afficher();
}

function exporterCsv() {
  const cell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
  const entete = ["Date d'enregistrement", "Équipe 1 (domicile)", "Équipe 2 (extérieur)", "Club du joueur", "Dossard", "Nom", "Prénom", "Date de naissance", "Étranger", "Nationalité", "Raisons", "Justification", "Observateur", "Fonction"];
  const lignes = BASE.lignes.map((l) => {
    const r = refDe(l.club_id, l.numero);
    return [jfr(l.created_at.slice(0, 10)), nomClub(l.matchs.club_domicile_id), nomClub(l.matchs.club_exterieur_id), nomClub(l.club_id), l.numero,
      r ? r.nom : "", r ? r.prenom || "" : "", r && r.date_naissance ? jfr(r.date_naissance) : "", (r && r.etranger) || l.etranger ? "oui" : "non", r && r.nationalite ? r.nationalite : "", l.motifs.map((k) => MOTIFS_COURT[k] || k).join(" + "), l.justification || "",
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
