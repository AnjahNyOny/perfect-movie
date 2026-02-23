// --- CONFIGURATION TMDB ---
const API_KEY = 'e5efa04a8d3803aeab052973807c017d';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const PLACEHOLDER = 'https://placehold.co/500x750?text=Affiche+Indisponible';

// Variables globales
let lastResults = []; // Stocke les derniers résultats de recherche
const searchInput = document.getElementById('movie-search');
const searchBtn = document.getElementById('search-btn');
const resultContainer = document.querySelector('.result-card-container');
const ratingModal = document.getElementById('rating-modal');
const userRatingInput = document.getElementById('user-rating');
const userCommentInput = document.getElementById('user-comment');
const cancelModalBtn = document.getElementById('cancel-modal');
const saveRatingBtn = document.getElementById('save-rating');

let searchTimeout = null;
let currentMovieToFinish = null;

/**
 * 1. FONCTION DE RECHERCHE
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
            lastResults = data.results.slice(0, 8); // On garde les 8 premiers
            displaySearchResults(lastResults);
        } else {
            resultContainer.innerHTML = '<p class="empty-msg">Aucun film trouvé.</p>';
        }
    } catch (error) {
        console.error("Erreur API:", error);
    }
}

// Debounce (recherche pendant la frappe)
searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchMovie(), 500);
});

/**
 * 2. AFFICHER LES RÉSULTATS
 */
function displaySearchResults(movies) {
    resultContainer.innerHTML = `
        <div class="search-results-grid">
            ${movies.map((movie, index) => {
                const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
                const poster = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : PLACEHOLDER;
                
                return `
                    <div class="movie-card mini search-item">
                        <div class="card-image">
                            <img src="${poster}" alt="${movie.title}">
                            <div class="overlay-simple">⭐ ${movie.vote_average.toFixed(1)}</div>
                        </div>
                        <div class="card-info">
                            <h3>${movie.title}</h3>
                            <p class="meta">${year}</p>
                            <button class="add-btn-small" onclick="addFromSearch(${index})">
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

// Fonction d'ajout par index (plus de bugs de guillemets !)
window.addFromSearch = function(index) {
    const movie = lastResults[index];
    if (movie) addToFirebase(movie);
};

/**
 * 3. ACTIONS FIREBASE
 */
async function addToFirebase(movie) {
    try {
        const movieData = {
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: movie.release_date || "",
            vote_average: movie.vote_average || 0,
            status: 'watching',
            addedAt: Date.now()
        };

        await window.fbActions.addDoc(window.moviesCol, movieData);
        searchInput.value = "";
        resultContainer.innerHTML = "";
    } catch (e) {
        console.error("Erreur Firebase:", e);
    }
}

window.removeFromList = async function (firebaseId) {
    if (confirm("Supprimer ce film de la liste ?")) {
        try {
            await window.fbActions.deleteDoc(window.fbActions.doc(window.db, "movies", firebaseId));
        } catch (e) {
            console.error(e);
        }
    }
};

/**
 * 4. MODAL & NOTATION
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
        const movieRef = window.fbActions.doc(window.db, "movies", currentMovieToFinish);
        
        // Import dynamique si nécessaire ou utilisation de fbActions si tu l'as complété
        // Ici on utilise directement le doc déjà présent
        const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

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
        console.error(e);
    }
});

/**
 * 5. SYNCHRONISATION
 */
function initRealtimeSync() {
    window.fbActions.onSnapshot(window.moviesCol, (snapshot) => {
        const movies = snapshot.docs.map(doc => ({ fbId: doc.id, ...doc.data() }));
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
                            <div class="user-score">Note : ${movie.userRating || '?'}/10</div>
                            ${movie.userComment ? `<div class="user-comment">"${movie.userComment}"</div>` : ''}
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// Lancement
const checkFB = setInterval(() => {
    if (window.db) {
        clearInterval(checkFB);
        initRealtimeSync();
    }
}, 100);