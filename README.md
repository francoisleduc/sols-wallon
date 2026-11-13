# Sols wallons

Portail sur l'artificialisation des sols dans les 261 communes de Wallonie, comparée aux trajectoires de réduction que le Schéma de développement du territoire (SDT 2024) fixe par bassin d'optimisation spatiale. Il s'adresse aux citoyens et aux journalistes. Il existe en français et en anglais.

C'est une étude indépendante. L'IWEPS, le SPF Finances, Statbel, la CPDT et la Région wallonne ne sont pas associés à ce portail et ne l'ont pas validé. « Sols wallons » est un nom provisoire.

## Ce que montre le site

- **Les bassins.** Pour chacun des 7 bassins du SDT, l'artificialisation nette de 2021 à 2024 comparée à la trajectoire. C'est le seul niveau où le SDT fixe un objectif. Le site ne porte aucun jugement par commune.
- **Les communes.** Pour chacune, le stock artificialisé, sa composition et les flux annuels. Les flux sont estimés à partir du cadastre et comparés aux séries de l'IWEPS.
- **L'étalement vu du ciel.** Sur trois communes pilotes (Gembloux, Herve, Marche-en-Famenne), les bâtiments et revêtements apparus entre 2018 et 2023 : leur zone au plan de secteur, leur parcelle et leur date. Un curseur fait défiler les années sur les photos aériennes de 2018 à 2026.

La page Méthode du site détaille les sources, les règles de calcul et les limites.

## Sources

| Source | Licence |
|---|---|
| SPF Finances, occupation du sol (natures cadastrales) et plan parcellaire | CC BY 4.0 et licence open data du SPF |
| IWEPS, indicateurs d'artificialisation | CC0 |
| Statbel, secteurs statistiques et occupation du sol | CC BY 4.0 |
| SPW, WalOUS (occupation du sol 2018, 2019, 2020, 2023), plan de secteur, centralités du SDT | CC BY 4.0 |
| SPW, orthophotos annuelles 2018 à 2026, lues en direct sur `geoservices.wallonie.be` | CC BY 4.0 |
| Schéma de développement du territoire, 2024 | Document public |

## Fonctionnement

- Le site est statique : HTML, CSS et JavaScript, sans dépendance ni outil de compilation.
- Les fichiers de `data/` sont générés par une chaîne de traitement tenue à part, qui les vérifie par deux audits avant chaque publication. L'un recalcule chaque chiffre depuis les fichiers bruts ; l'autre compare l'affichage aux données, sur les 261 fiches, en français et en anglais.
- Les photos aériennes sont demandées au service de visualisation du SPW au moment où l'on zoome, une tuile à la fois. Elles ne sont pas copiées dans ce dépôt.

Pour le voir en local, il faut le servir par un serveur web, par exemple :

```bash
npx --yes http-server@14.1.1 . -p 8765 -a localhost -c-1
```

## Auteur et contact

À compléter.
