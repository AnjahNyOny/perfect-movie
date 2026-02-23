// --- CONFIGURATION TMDB ---
const API_KEY = 'e5efa04a8d3803aeab052973807c017d';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const PLACEHOLDER = 'https://via.placeholder.com/500x750?text=Affiche+Indisponible';

// Variables pour la recherche
let currentFoundMovie = null;

// Éléments du DOM
const searchInput = document.getElementById('movie-search');
const searchBtn = document.getElementById('search-btn');
const resultContainer = document.querySelector('.result-card-container');

/**
 * 1. FONCTION DE RECHERCHE (API TMDB)
 */
async function searchMovie() {
    const query = searchInput.value.trim();
    if (!query) return;

    resultContainer.innerHTML = '<div class="loading-spinner">Recherche en cours...</div>';

    try {
        const response = await fetch(`${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=fr-FR`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            currentFoundMovie = data.results[0]; 
            displaySearchResult(currentFoundMovie);
        } else {
            resultContainer.innerHTML = '<p class="error-msg">Aucun film trouvé.</p>';
        }
    } catch (error) {
        console.error(error);
        resultContainer.innerHTML = '<p class="error-msg">Erreur de connexion à l\'API.</p>';
    }
}

/**
 * 2. AFFICHER LE RÉSULTAT DE RECHERCHE
 */
function displaySearchResult(movie) {
    const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    const posterPath = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : PLACEHOLDER;
    const score = movie.vote_average ? movie.vote_average.toFixed(1) : 'NR';

    resultContainer.innerHTML = `
        <div class="movie-card featured">
            <div class="card-image">
                <img src="${posterPath}" alt="${movie.title}">
                <div class="overlay"><span class="rating">⭐ ${score}</span></div>
            </div>
            <div class="card-info">
                <h3>${movie.title}</h3>
                <p class="genre">${releaseYear}</p>
                <p class="description">${movie.overview || "Pas de résumé."}</p>
                <button class="add-btn" id="btn-add-cloud">
                    <i data-lucide="plus"></i> Ajouter à notre liste
                </button>
            </div>
        </div>
    `;

    // Écouteur pour l'ajout à Firebase
    document.getElementById('btn-add-cloud').addEventListener('click', () => {
        addToFirebase(movie);
    });

    if (window.lucide) lucide.createIcons();
}

/**
 * 3. ACTIONS FIREBASE (CLOUD)
 */

// Ajouter au Cloud
async function addToFirebase(movie) {
    try {
        // On prépare l'objet à enregistrer
        const movieData = {
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: movie.release_date || "",
            vote_average: movie.vote_average || 0,
            addedAt: Date.now() // Pour trier par date d'ajout
        };

        await window.fbActions.addDoc(window.moviesCol, movieData);
        searchInput.value = ""; // On vide la recherche
        resultContainer.innerHTML = ""; // On vide le résultat
    } catch (e) {
        console.error("Erreur d'ajout :", e);
        alert("Erreur lors de l'ajout au cloud.");
    }
}

// Supprimer du Cloud (rendu global pour le onclick)
window.removeFromList = async function(firebaseId) {
    if(confirm("Supprimer ce film de la liste ?")) {
        try {
            await window.fbActions.deleteDoc(window.fbActions.doc(window.db, "movies", firebaseId));
        } catch (e) {
            console.error("Erreur suppression :", e);
        }
    }
};

/**
 * 4. SYNCHRONISATION TEMPS RÉEL
 */
function initRealtimeSync() {
    // onSnapshot écoute la base de données : si ta copine ajoute un film, 
    // l'interface se mettra à jour toute seule chez toi !
    window.fbActions.onSnapshot(window.moviesCol, (snapshot) => {
        const movies = snapshot.docs.map(doc => ({ 
            fbId: doc.id, 
            ...doc.data() 
        }));

        // Trier par date d'ajout (le plus récent en premier)
        movies.sort((a, b) => b.addedAt - a.addedAt);

        renderUIList(movies);
    });
}

function renderUIList(movies) {
    const myListGrid = document.querySelector('.movie-grid');
    const countSpan = document.querySelector('.count');
    
    countSpan.textContent = `${movies.length} film${movies.length > 1 ? 's' : ''}`;

    if (movies.length === 0) {
        myListGrid.innerHTML = '<p class="empty-msg">Votre liste est vide. Ajoutez un film !</p>';
        return;
    }

    myListGrid.innerHTML = movies.map(movie => {
        const poster = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : PLACEHOLDER;
        return `
            <div class="movie-card mini">
                <div class="card-image">
                    <img src="${poster}" alt="${movie.title}">
                    <button class="remove-btn" onclick="removeFromList('${movie.fbId}')">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="card-info">
                    <h3>${movie.title}</h3>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// Initialisation
searchBtn.addEventListener('click', searchMovie);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchMovie(); });

// On attend que Firebase soit prêt (injecté dans window) pour lancer la synchro
const checkFB = setInterval(() => {
    if (window.db) {
        clearInterval(checkFB);
        initRealtimeSync();
    }
}, 100);