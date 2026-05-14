# Palier — Réseau social de voisinage

Application web mobile pour l'entraide entre voisins à Angers.

## Installation en 5 minutes

### 1. Créer un projet Supabase

1. Allez sur [supabase.com](https://supabase.com) et créez un projet gratuit
2. Dans **Settings > API**, copiez :
   - **Project URL** (ex: `https://xxxx.supabase.co`)
   - **anon public key**

### 2. Configurer l'application

Ouvrez `js/app.js` et remplacez les deux premières lignes :

```js
const SUPABASE_URL = 'https://votre-projet.supabase.co';
const SUPABASE_ANON_KEY = 'votre-clé-anon-publique';
```

### 3. Créer la base de données

Dans votre projet Supabase :
1. Allez dans **SQL Editor**
2. Copiez-collez le contenu de `supabase-schema.sql`
3. Cliquez **Run**

### 4. Configurer le bucket de photos (optionnel)

Dans **Storage** de Supabase :
1. Créez un bucket nommé `avatars`
2. Cochez **Public bucket**
3. Dans SQL Editor, exécutez les lignes commentées en bas de `supabase-schema.sql` (section STORAGE)

### 5. Activer la vérification email

Dans **Authentication > Email Templates**, l'email de confirmation est activé par défaut.

### 6. Lancer l'application

Ouvrez simplement `index.html` dans un navigateur, ou déployez sur :
- **Netlify** : glissez le dossier sur [netlify.com/drop](https://app.netlify.com/drop)
- **Vercel** : `npx vercel`
- **GitHub Pages** : activez depuis les settings de votre repo

## Structure du projet

```
palier/
├── index.html          # App shell
├── styles.css          # Styles complets
├── js/
│   └── app.js          # Application complète (SPA vanilla JS)
├── pages/
│   ├── cgu.html        # Conditions Générales d'Utilisation
│   └── privacy.html    # Politique de confidentialité RGPD
└── supabase-schema.sql # Schéma de base de données complet
```

## Fonctionnalités MVP

- **Inscription** — Email + mot de passe, vérification email obligatoire
- **Feed local** — Publications filtrables par quartier et catégorie
- **Publier** — Besoin ou offre, 6 catégories
- **Messagerie** — Privée entre deux voisins, temps réel
- **Profil** — Photo, bio, niveau de confiance, historique
- **Signalement** — Sur chaque post et profil
- **Pages légales** — CGU et politique de confidentialité RGPD

## Personnalisation

- Couleurs : modifiez les variables CSS dans `styles.css` (`:root`)
- Quartiers : modifiez le tableau `QUARTIERS` dans `js/app.js`
- Contact légal : remplacez `contact@palier-app.fr` dans les pages légales
