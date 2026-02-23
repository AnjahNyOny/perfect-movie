// --- CONFIGURATION TMDB ---
const API_KEY = 'e5efa04a8d3803aeab052973807c017d';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const PLACEHOLDER = 'https://via.placeholder.com/500x750?text=Affiche+Indisponible';

// Variables pour la recherche
let currentFoundMovie = null;
const searchInput = document.getElementById('movie-search');
const searchBtn = document.getElementById('search-btn');
const resultContainer = document.querySelector('.result-card-container');

// Variables pour le debounce
let searchTimeout = null;

// Éléments du DOM (ajouts)
const ratingModal = document.getElementById('rating-modal');
const userRatingInput = document.getElementById('user-rating');
const userCommentInput = document.getElementById('user-comment');
const cancelModalBtn = document.getElementById('cancel-modal');
const saveRatingBtn = document.getElementById('save-rating');
let currentMovieToFinish = null;

/**
 * 1. FONCTION DE RECHERCHE (API TMDB)
 */
async function searchMovie() {
    const query = searchInput.value.trim();
    if (!query) {
        resultContainer.innerHTML = "";
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=fr-FR`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
            // On envoie les 5 ou 6 premiers résultats pour ne pas surcharger la page
            displaySearchResults(data.results.slice(0, 6)); 
        } else {
            resultContainer.innerHTML = '<p class="error-msg">Aucun film trouvé.</p>';
        }
    } catch (error) {
        console.error(error);
    }
}
/**
 * DEBOUNCE POUR LA RECHERCHE EN TEMPS RÉEL
 */
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchMovie();
    }, 500); // Attend 500ms après la dernière frappe
});

/**
 * 2. AFFICHER LE RÉSULTAT DE RECHERCHE
 */
function displaySearchResults(movies) {
    // On vide le conteneur et on crée une grille pour les résultats
    resultContainer.innerHTML = `
        <div class="search-results-grid">
            ${movies.map((movie, index) => {
                const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
                const posterPath = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : PLACEHOLDER;
                
                // On transforme l'objet movie en chaîne de caractères sécurisée pour le bouton
                const movieData = encodeURIComponent(JSON.stringify(movie));

                return `
                    <div class="movie-card mini search-item">
                        <div class="card-image">
                            <img src="${posterPath}" alt="${movie.title}">
                            <div class="overlay-simple">⭐ ${movie.vote_average.toFixed(1)}</div>
                        </div>
                        <div class="card-info">
                            <h3>${movie.title}</h3>
                            <p class="meta">${releaseYear}</p>
                            <button class="add-btn-small" onclick="addFromSearch('${movieData}')">
                                <i data-lucide="plus"></i> Ajouter
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    if (window.lucide) lucide.createIcons();
}

// Nouvelle fonction pour gérer l'ajout depuis cette liste
window.addFromSearch = function(encodedMovieData) {
    const movie = JSON.parse(decodeURIComponent(encodedMovieData));
    addToFirebase(movie);
};

/**
 * 3. ACTIONS FIREBASE (CLOUD)
 */

async function addToFirebase(movie) {
    try {
        const movieData = {
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: movie.release_date || "",
            vote_average: movie.vote_average || 0,
            status: 'watching', // Par défaut
            addedAt: Date.now()
        };

        await window.fbActions.addDoc(window.moviesCol, movieData);
        searchInput.value = "";
        resultContainer.innerHTML = "";
    } catch (e) {
        console.error("Erreur d'ajout :", e);
    }
}

window.removeFromList = async function (firebaseId) {
    if (confirm("Supprimer ce film de la liste ?")) {
        try {
            await window.fbActions.deleteDoc(window.fbActions.doc(window.db, "movies", firebaseId));
        } catch (e) {
            console.error("Erreur suppression :", e);
        }
    }
};

/**
 * LOGIQUE DE NOTATION ET STATUT "TERMINÉ"
 */
window.openRatingModal = function (firebaseId) {
    currentMovieToFinish = firebaseId;
    ratingModal.classList.add('active');
};

cancelModalBtn.addEventListener('click', () => {
    ratingModal.classList.remove('active');
    currentMovieToFinish = null;
});

saveRatingBtn.addEventListener('click', async () => {
    if (!currentMovieToFinish) return;

    const userRating = userRatingInput.value;
    const userComment = userCommentInput.value;

    try {
        // Mise à jour du document dans Firebase
        const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const movieRef = doc(window.db, "movies", currentMovieToFinish);

        await updateDoc(movieRef, {
            status: 'finished',
            userRating: userRating,
            userComment: userComment,
            finishedAt: Date.now()
        });

        ratingModal.classList.remove('active');
        userRatingInput.value = "";
        userCommentInput.value = "";
        currentMovieToFinish = null;
    } catch (e) {
        console.error("Erreur mise à jour :", e);
    }
});

/**
 * 4. SYNCHRONISATION TEMPS RÉEL
 */
function initRealtimeSync() {
    window.fbActions.onSnapshot(window.moviesCol, (snapshot) => {
        const movies = snapshot.docs.map(doc => ({
            fbId: doc.id,
            ...doc.data()
        }));

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
        const isFinished = movie.status === 'finished';

        return `
            <div class="movie-card mini ${isFinished ? 'finished' : ''}">
                <div class="card-image">
                    ${isFinished ? '<span class="finished-badge">Terminé</span>' : ''}
                    <img src="${poster}" alt="${movie.title}">
                    <button class="remove-btn" onclick="removeFromList('${movie.fbId}')">
                        <i data-lucide="x"></i>
                    </button>
                    ${movie.userRating ? `<div class="mini-rating">${movie.userRating}/10</div>` : ''}
                </div>
                <div class="card-info">
                    <h3>${movie.title}</h3>
                    ${!isFinished ? `
                        <button class="finish-btn" onclick="openRatingModal('${movie.fbId}')">
                            Marquer comme terminé
                        </button>
                    ` : `
                        <div class="user-review">
                            <div class="user-score">Ma note : ${movie.userRating || '?'}/10</div>
                            ${movie.userComment ? `<div class="user-comment">"${movie.userComment}"</div>` : ''}
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// Initialisation
searchBtn.addEventListener('click', searchMovie);
searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchMovie(); });

const checkFB = setInterval(() => {
    if (window.db) {
        clearInterval(checkFB);
        initRealtimeSync();
    }
}, 100);