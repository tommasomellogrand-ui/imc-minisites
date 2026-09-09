# IMC Minisite Data Feed

Runtime READ-only per i minisiti IMC.

## Fonte dati

- MySQL Aruba CORE: `Sql1956795_1`
- Supabase IMC Nexus: ponte tecnico
- Nessuna copia dati in GitHub

## Tabelle CORE consentite

1. `IMC Game World Codex Global`
2. `IMC Game World Club Mapping`
3. `IMC Competition Codex Global`
4. `IMC Country Codex Global`
5. `IMC National Team Codex Global`
6. `IMC Club Codex Global`
7. `IMC Manager Codex Global`
8. `IMC Player Codex Global`
9. `IMC Manager Assignment Global`
10. `IMC Player Codex Global Data`
11. `IMC Player Codex Global Rating History`

## Risorse esposte

- `bootstrap&gw=GW005`
- `game_world&gw=GW005`
- `clubs&gw=GW005`
- `competitions&gw=GW005`
- `countries`
- `national_teams`
- `managers`
- `manager_assignments&gw=GW005`
- `players&limit=50&offset=0&q=rossi`
- `player_data&player_id=123`
- `player_data&limit=50&offset=0`
- `rating_history&player_id=123&limit=50&offset=0`

Il feed non accetta SQL, nomi tabella arbitrari o operazioni WRITE.

## Cache

- dati dinamici (`manager_assignments`, `player_data`, `rating_history`): 60 secondi;
- anagrafiche e struttura: 300 secondi;
- `bootstrap`: 60 secondi.

## Sicurezza

- runtime Edge Function con JWT Supabase obbligatorio;
- CORS limitato a `italianmastersclub.it` e `www.italianmastersclub.it`;
- bridge RPC Supabase accessibile solo a `service_role`;
- query MySQL rigidamente costruite dal server da una allowlist di risorse;
- nessun INSERT, UPDATE, DELETE, DDL o query arbitraria.
