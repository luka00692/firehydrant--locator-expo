# Handoff: Hidranti SI — iskalnik najbližjega hidranta

## Overview
Mobilna aplikacija za gasilska društva: vpišeš kraj požara in aplikacija poišče **najbližji hidrant po cestni razdalji**, izriše pot in ponudi navigacijo. Vključuje onboarding, prijavo, pakete/plačilo, skupine z odobritvami članov, vozila in filtriranje hidrantov. Vsebina je v slovenščini.

Ciljni repozitorij: **`luka00692/firehydrant--locator-expo`** (Expo / React Native).

## About the Design Files
Datoteka `Hidranti SI.dc.html` je **dizajnerska referenca, narejena v HTML** — prototip, ki prikazuje želen videz in obnašanje, **ni produkcijska koda za neposredno kopiranje**. Naloga je te zaslone **poustvariti v obstoječem Expo/React Native okolju** (React Native `View`/`Text`/`Pressable`, `react-native-maps` ali `expo-maps`, `expo-location`), z ustaljenimi vzorci projekta. HTML odpri v brskalniku za ogled interakcij.

## Fidelity
**High-fidelity (hifi).** Končne barve, tipografija, razmiki in interakcije so dokončni — poustvari 1:1, a z domačimi RN komponentami in knjižnicami projekta. Leaflet → `react-native-maps`; SVG ikone (Lucide slog) → `lucide-react-native` ali `react-native-svg`.

## Zunanje storitve (že implementirano v prototipu — vzorec obnašanja)
- **Geokodiranje + predlogi naslovov:** Nominatim `https://nominatim.openstreetmap.org/search?format=json&countrycodes=si&q=...` (predlogi: `limit=5&addressdetails=1`, debounce 300 ms). V produkciji klice usmeri prek lastnega backenda zaradi rate-limita in `User-Agent` politike OSM.
- **Najbližji po cestah:** OSRM Table `https://router.project-osrm.org/table/v1/driving/{coords}?sources=0&annotations=distance,duration` (8 zračno najbližjih kandidatov → prerazvrsti po cestni razdalji). Fallback: zračna razdalja × 1,32 z oznako »ocena«.
- **Pot za izris:** OSRM Route `.../route/v1/driving/{from};{to}?overview=full&geometries=geojson`.
- **Podatki o hidrantih (PRAVI):** Overpass `area["ISO3166-1"="SI"][admin_level=2]; node["emergency"="fire_hydrant"](area); out 15000;` ob zagonu zemljevida; ob premikanju (zoom ≥ 13) dopolnjuje po vidnem oknu. Sintetični nabor (~1900 točk, znotraj obrisa Slovenije) je **samo offline fallback** — v produkciji uporabi pravo bazo (Supabase + PostGIS po priloženem načrtu).
- **Nativna navigacija:** deep link `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving` (na RN uporabi `Linking.openURL`; za iOS ponudi tudi `maps://`).
- Vse točke požara/lokacije se **ne shranjujejo** — samo trenutna poizvedba. Filtriranje na Slovenijo je point-in-polygon (poenostavljen obris).

## Screens / Views
Zaporedje (router po stanju `screen`): `onboarding → auth → packages → (checkout) → groupNew | join → waiting → app`. Znotraj `app` so 4 zavihki: **Zemljevid, Skupina, Vozila, Profil** (zavihka »Načrt« NI).

1. **Onboarding** — dark maroon (`#4A1212`) ozadje, logo Abelium (bel), gumb »Preskoči«. 3 slidi (ikona v `#C62828` kvadratu 76 px r16, eyebrow uppercase, naslov 32 px/700, daljši opis `rgba(255,255,255,.72)` 300). Pike napredka (aktivna 24 px `#C62828`, ostale 6 px). Gumb »Naprej« → zadnji »Začni«.
2. **Auth** — bel; preklop Prijava/Registracija (aktiven `#4A1212` fill), polja e-pošta/geslo, primarni gumb, ločilo »ali«, gumba »Nadaljuj z Googlom« (obroba) in »Nadaljuj z Applom« (črn). Vsi vodijo na packages.
3. **Packages** — `#F6F8FA`; 3 kartice (Mali 4,99 € / Srednji 14,99 € / Veliki 29,99 €); izbrana ima obrobo `#C62828` in razkrije korak količine (± gumba). Način plačila: Kartica (Stripe) / Predračun. Gumba »Nadaljuj na plačilo« in »Vstopi kot gost«. Mali → naravnost v app (skupina enega); gost → join.
4. **Checkout** — povzetek (paket × količina, skupaj); Stripe: testna kartica + »Plačaj X €«; Predračun: obvestilo + polje za aktivacijsko kodo + »Aktiviraj licenco«. Uspeh → groupNew (razen mali → app).
5. **Group new** — vnos imena skupine → »Ustvari skupino« → app kot lastnik.
6. **Join** — vnos imena skupine → »Pošlji prošnjo« → waiting.
7. **Waiting** — maroon, spinner, »Čakam na odobritev«, ime skupine; gumb »Simuliraj odobritev« (v produkciji Supabase Realtime + polling 10 s) in »Prekliči«. Po odobritvi → app kot član (Gost).
8. **App / Zemljevid** — poln zaslon zemljevid; zgoraj plavajoča iskalna vrstica z gumbom (`#C62828`), spustni predlogi naslovov, sporočilo »ni najdeno«; vrstica gumbov: »Moja lokacija«, »Kategorije« (filter: vrsta Vsi/Nadzemni/Podzemni, premer Vsi/80/100/150), čip aktivnega vozila. Ob izbrani točki: temna vrstica z rdečo piko + razdaljo. Spodaj desno zoom, spodaj levo števec »N hidrantov · vsa Slovenija«. Oznake: nadzemni `#C62828`, podzemni `#E57373`, izbrani `#4A1212` (18 px, izbrani 26 px). Moja lokacija = utripajoča modra… (v tej rdeči temi rdeča) pika z obročem natančnosti; točka požara/naslov = rdeče-oranžen (`#E4572E`) pin.
   - **Detail sheet** (bottom, nad tab barom, r22 zgoraj): ikona kapljice, naslov (Nadzemni/Podzemni hidrant), podnaslov (kraj · OSRM/ocena), opisni stavek tipa, 3 statistike (Premer/Pretok/Tlak — »ni podatka«, če manjka), moder pas s cestno razdaljo + časom, gumba »Pokaži pot« (fill) in »Odpri navigacijo« (obroba).
9. **App / Skupina** — ime skupine + vloga + sedeži (npr. 12/50); lastnik: »Preimenuj«, »Lokacija doma«, čakajoče prošnje (odobri ✓ / zavrni ×; onemogočeno ob polnih sedežih z opozorilom), seznam članov (avatar iniciale, vloga; lastnik lahko »Admin« ali odstrani; lastnika ni mogoče odstraniti).
10. **App / Vozila** — kartice vozil (ime + »Premer cevi X mm«, izbrano = obroba/značka »Izbrano«, klik izbere). Lastnik: obrazec »Dodaj vozilo« (ime + izbira premera 75/110/150) + »Dodaj«, odstranjevanje ×. Izbrano vozilo določa premer za iskanje (čip na zemljevidu).
11. **App / Profil** — kartica uporabnika (avatar `#4A1212`), vrstice Skupina/Vloga/Paket, »Odjava« (rdeča obroba), opomba o Lucide ikonah.
12. **Bottom tab bar** — 4 zavihki (Zemljevid, Skupina, Vozila, Profil), aktiven `#C62828`, neaktiven `#B6BEC6`; na Skupini rdeča pika, če so čakajoče prošnje. `backdrop-blur` + polprosojno belo ozadje.

## Interactions & Behavior
- Navigacija po stanju (glej zaporedje). Middleware pravila iz načrta: neprijavljen→onboarding/login; brez paketa/članstva→packages; gost pending→waiting; lastnik z neporabljeno licenco→group/new.
- Iskanje: debounce 300 ms za predloge (min 3 znaki); Enter ali gumb sproži geokodiranje; ob neuspehu retry z », Slovenija« nato sporočilo o napaki.
- Ob določitvi točke → izračun najbližjega (spinner) → izbere najbližjega, odpre sheet, izriše pot, `flyTo`/`fitBounds`.
- Filter takoj posodobi oznake, števec in izbor najbližjega.
- Sedežne omejitve preverjaj **na strežniku** (v prototipu le v UI).
- Animacije (restrained): fade + translateY 8 px (`ab-fade`), sheet slide-up (`ab-sheet`), spin, location pulse. Trajanja 200–420 ms, easing `cubic-bezier(0.22,0.61,0.36,1)`.

## State Management
`screen`, `slide`, `authMode`, `email/pass`, `pkg`, `qty{small,medium,large}`, `pay`, `code`, `groupNameInput`, `joinNameInput`, `tab`, `role(owner|member)`, `packageLabel`, `groupName`, `seatsTotal`, `members[]`, `requests[]`, `vehicles[]`, `activeVehicle`, `vehNameInput/vehPremer`, `addrInput`, `suggestions[]`, `notFound`, `fType/fPremer/showFilters`, `searching`, `fire{lat,lng,label,kind,acc}`, `selected(hydrant+road/dur)`, `nearest[]`. Zemljevid, plasti markerjev in route-line so imperativni (izven React state).

## Design Tokens
**Barve (rdeča tema):** primary `#C62828`; dark anchor/maroon `#4A1212`; secondary/podzemni `#E57373`; točka požara `#E4572E`; light tint `#FCE7E7`; spinner track `#F0C4C4`; dark tint text `#8E1616`; bela `#FFFFFF`. **Nevtralno (ink):** `#F6F8FA`, `#ECEFF2`, `#D9DEE3`, `#B6BEC6`, `#8A949E`, `#5C6770`, `#2F3940`.
**Tipografija:** Hanken Grotesk (= HK Grotesk iz Abelium CGP), uteži 300–900. Body 16/1.5; naslovi 24–32/700; eyebrow 11–13 uppercase `letter-spacing:.16em`.
**Radii:** gumbi pill `9999px`; kartice `10–14px`; vnosi `8px`; sheet `22px` zgoraj. **Razmiki:** 4-pt lestvica (4/8/12/16/24/32…). **Sence:** redke — `0 8px 24px rgba(0,48,64,.14)` za plavajoče, `0 1px 2px rgba(0,48,64,.06)` za kartice.

## Assets
- `assets/abelium-znak.svg`, `abelium-znak-bw.svg`, `abelium-simbol.svg` — logotipi Abelium (iz Abelium Design System / CGP).
- Ikone: **Lucide** slog (iskanje, lokacija, tovornjak, uporabniki, filter/lijak, kapljica, kljukica, ×, ±). To je nadomestek — ni del uradnega CGP Abelium; v produkciji `lucide-react-native`.
- Podlaga zemljevida: OpenStreetMap ploščice (atribucija obvezna).

## Files
- `Hidranti SI.dc.html` — celoten prototip (en Design Component: markup + logika). Odpri v brskalniku; logika je v `<script data-dc-script>` razredu `Component` (metode `seedHydrants`, `loadCountry`, `computeNearest`, `drawRoute`, `geocode`, `fetchSuggestions`, `matchFilter`, `inSLO`).
