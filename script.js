// --- CONFIGURATION TMDB ---
const API_KEY = 'e5efa04a8d3803aeab052973807c017d';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const PLACEHOLDER = 'https://placehold.co/500x750?text=Affiche+Indisponible';

// Variables globales
let lastResults = [];
let currentUser = null;
let currentCoupleId = null; // NOUVEAU: Stocke l'ID partagé du couple
let currentMovieToFinish = null;
let searchTimeout = null;
let genreMap = {};

// Elements du DOM...
const trailerModal = document.getElementById('trailer-modal');
const trailerContainer = document.getElementById('trailer-container');
const closeTrailerBtn = document.getElementById('close-trailer');
let allMovies = [];
let localSearchQuery = "";
let currentGenreFilter = "all";
let currentStatusFilter = "all";
let currentSort = "addedAt-desc";

const searchSection = document.getElementById('search-section');
const coupleDashboard = document.getElementById('couple-dashboard');
const searchInput = document.getElementById('movie-search');
const resultContainer = document.querySelector('.result-card-container');
const ratingModal = document.getElementById('rating-modal');
const userRatingInput = document.getElementById('user-rating');
const userCommentInput = document.getElementById('user-comment');
const cancelModalBtn = document.getElementById('cancel-modal');
const saveRatingBtn = document.getElementById('save-rating');
const randomBtn = document.getElementById('random-btn');
const randomModal = document.getElementById('random-modal');
const randomResultContainer = document.getElementById('random-result-container');
const closeRandomBtn = document.getElementById('close-random');
const reshuffleBtn = document.getElementById('reshuffle-btn');
const localSearchInput = document.getElementById('local-search');
const genreFilterSelect = document.getElementById('genre-filter');
const statusFilterSelect = document.getElementById('status-filter');
const sortFilterSelect = document.getElementById('sort-filter');
const authControls = document.getElementById('auth-controls');
const authModal = document.getElementById('auth-modal');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authSubmitBtn = document.getElementById('auth-submit');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const closeAuthBtn = document.getElementById('close-auth');
const loginOpenBtn = document.getElementById('login-open-btn');

let authMode = 'login'; 

/**
 * THEME MANAGEMENT
 */
function initTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    themeToggle?.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });
}

function updateThemeIcon(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
    if (window.lucide) lucide.createIcons();
}

/**
 * INITIALIZATION & GENRES
 */
async function fetchGenres() {
    try {
        const response = await fetch(`${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=fr-FR`);
        const data = await response.json();
        data.genres.forEach(g => {
            genreMap[g.id] = g.name;
            const option = document.createElement('option');
            option.value = g.id;
            option.textContent = g.name;
            genreFilterSelect.appendChild(option);
        });
    } catch (e) {
        console.error("Genres load error:", e);
    }
}

/**
 * AUTH & COUPLE LOGIC
 */
function initAuth() {
    initTheme();

    window.authActions.onAuthStateChanged(window.auth, async (user) => {
        currentUser = user;
        if (user) {
            // NOUVEAU: Récupérer ou créer le profil utilisateur pour le Code Couple
            const userRef = window.fbActions.doc(window.db, 'users', user.uid);
            const userSnap = await window.fbActions.getDoc(userRef);

            if (userSnap.exists()) {
                currentCoupleId = userSnap.data().coupleId;
            } else {
                // Si c'est un nouveau compte, le coupleId par défaut est son UID
                currentCoupleId = user.uid;
                await window.fbActions.setDoc(userRef, { email: user.email, coupleId: currentCoupleId });
            }

            updateAuthUI();
            initRealtimeSync();
            fetchGenres();
        } else {
            currentCoupleId = null;
            allMovies = [];
            renderUIList([]);
            updateAuthUI();
        }
    });

    tabLogin.addEventListener('click', () => setAuthMode('login'));
    tabSignup.addEventListener('click', () => setAuthMode('signup'));

    loginOpenBtn?.addEventListener('click', () => {
        authModal.classList.add('active');
        authError.textContent = "";
    });

    closeAuthBtn.addEventListener('click', () => {
        authModal.classList.remove('active');
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = authEmail.value;
        const password = authPassword.value;
        authError.textContent = "";

        try {
            if (authMode === 'login') {
                await window.authActions.signInWithEmailAndPassword(window.auth, email, password);
            } else {
                await window.authActions.createUserWithEmailAndPassword(window.auth, email, password);
            }
            authModal.classList.remove('active');
            authForm.reset();
        } catch (error) {
            console.error(error);
            authError.textContent = "Erreur: " + error.message;
        }
    });

    // Gestion des boutons du Code Couple
    document.getElementById('copy-code-btn').addEventListener('click', () => {
        const codeInput = document.getElementById('my-couple-code');
        codeInput.select();
        document.execCommand('copy');
        alert("Code copié ! Envoie-le à ton/ta partenaire.");
    });

    document.getElementById('join-code-btn').addEventListener('click', async () => {
        const newCode = document.getElementById('join-couple-code').value.trim();
        if (newCode && newCode !== currentCoupleId) {
            if(confirm("Attention : en rejoignant cette liste, tu ne verras plus ta liste actuelle. Continuer ?")) {
                const userRef = window.fbActions.doc(window.db, 'users', currentUser.uid);
                await window.fbActions.setDoc(userRef, { coupleId: newCode }, { merge: true });
                currentCoupleId = newCode;
                document.getElementById('my-couple-code').value = currentCoupleId;
                document.getElementById('join-couple-code').value = "";
                alert("Super ! Tu as rejoint la liste !");
                initRealtimeSync(); // Recharge la liste avec le nouveau code
            }
        }
    });
}

function setAuthMode(mode) {
    authMode = mode;
    if (mode === 'login') {
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
        authSubmitBtn.textContent = 'Se connecter';
    } else {
        tabLogin.classList.remove('active');
        tabSignup.classList.add('active');
        authSubmitBtn.textContent = "S'inscrire";
    }
}

function updateAuthUI() {
    if (currentUser) {
        const email = currentUser.email;
        const avatarUrl = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(email)}`;

        authControls.innerHTML = `
            <div class="user-profile">
                <div class="user-avatar" title="${email}">
                    <img src="${avatarUrl}" alt="Avatar">
                </div>
                <div class="user-info">
                    <button class="logout-btn" onclick="logout()">Déconnexion</button>
                </div>
            </div>
        `;
        
        searchSection.style.display = 'block';
        coupleDashboard.style.display = 'block';
        document.getElementById('my-couple-code').value = currentCoupleId || currentUser.uid;

    } else {
        authControls.innerHTML = `<button id="login-open-btn" class="login-trigger">Connexion</button>`;
        document.getElementById('login-open-btn').addEventListener('click', () => {
            authModal.classList.add('active');
        });
        searchSection.style.display = 'none';
        coupleDashboard.style.display = 'none';
    }
}

window.logout = () => {
    window.authActions.signOut(window.auth);
};

/**
 * SEARCH & API
 */
async function searchMovie() {
    if (!currentUser) return;
    const query = searchInput.value.trim();
    if (!query) {
        resultContainer.innerHTML = "";
        return;
    }

    resultContainer.innerHTML = `
        <div class="search-results-grid">
            ${Array(4).fill(0).map(() => '<div class="skeleton-card skeleton"></div>').join('')}
        </div>
    `;

    try {
        const response = await fetch(`${BASE_URL}/search/movie?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=fr-FR`);
        const data = await response.json();
        const searchResultSection = document.getElementById('search-result');
        
        if (data.results && data.results.length > 0) {
            searchResultSection.style.display = 'block';
            lastResults = data.results.slice(0, 8);
            displaySearchResults(lastResults);
        } else {
            searchResultSection.style.display = 'block';
            resultContainer.innerHTML = '<p class="empty-msg">Aucun film trouvé.</p>';
        }
    } catch (error) {
        console.error("Erreur API:", error);
    }
}

searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchMovie(), 500);
});

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
                            <div class="card-actions">
                                <button class="add-btn-small" onclick="addFromSearch(${index})">
                                    <i data-lucide="plus"></i> Ajouter
                                </button>
                                <button class="trailer-btn" onclick="openTrailer('${movie.id}')">
                                    <i data-lucide="play"></i> Trailer
                                </button>
                            </div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

window.addFromSearch = function (index) {
    const movie = lastResults[index];
    if (movie) addToFirebase(movie);
};

/**
 * TRAILER LOGIC
 */
async function fetchTrailer(tmdbId) {
    if (!tmdbId || tmdbId === 'undefined' || tmdbId === 'null') return null;
    try {
        const response = await fetch(`${BASE_URL}/movie/${tmdbId}/videos?api_key=${API_KEY}&language=fr-FR`);
        if (!response.ok) return null;

        const data = await response.json();
        let trailer = data.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube');

        if (!trailer) {
            const resEn = await fetch(`${BASE_URL}/movie/${tmdbId}/videos?api_key=${API_KEY}`);
            if (resEn.ok) {
                const dataEn = await resEn.json();
                trailer = dataEn.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') || dataEn.results?.find(v => v.site === 'YouTube');
            }
        }
        return trailer ? trailer.key : null;
    } catch (e) {
        return null;
    }
}

window.openTrailer = async function (tmdbId) {
    if (!tmdbId || tmdbId === 'undefined' || tmdbId === 'null' || tmdbId === '') {
        trailerModal.classList.add('active');
        trailerContainer.innerHTML = `<div class="empty-msg"><p>Identifiant manquant.</p></div>`;
        return;
    }

    trailerContainer.innerHTML = '<p class="empty-msg">Chargement...</p>';
    trailerModal.classList.add('active');

    const key = await fetchTrailer(tmdbId);
    if (key) {
        trailerContainer.innerHTML = `<iframe src="https://www.youtube.com/embed/${key}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
    } else {
        trailerContainer.innerHTML = '<p class="empty-msg">Aucune vidéo trouvée.</p>';
    }
};

closeTrailerBtn.addEventListener('click', () => {
    trailerModal.classList.remove('active');
    trailerContainer.innerHTML = "";
});

/**
 * FIREBASE ACTIONS
 */
async function addToFirebase(movie) {
    if (!currentUser || !currentCoupleId) return;
    try {
        const movieData = {
            title: movie.title,
            poster_path: movie.poster_path,
            release_date: movie.release_date || "",
            vote_average: movie.vote_average || 0,
            status: 'watching',
            addedAt: Date.now(),
            addedBy: currentUser.email,
            addedById: currentUser.uid,
            coupleId: currentCoupleId, // NOUVEAU: On associe le film au couple !
            genre_ids: movie.genre_ids || [],
            genres: (movie.genre_ids || []).map(id => genreMap[id] || 'Autre'),
            tmdbId: movie.id
        };

        await window.fbActions.addDoc(window.moviesCol, movieData);
        searchInput.value = "";
        resultContainer.innerHTML = "";
        document.getElementById('search-result').style.display = 'none';
    } catch (e) {
        console.error("Erreur Firebase:", e);
    }
}

window.removeFromList = async function (firebaseId) {
    if (!currentUser) return;
    if (confirm("Supprimer ce film de la liste ?")) {
        try {
            await window.fbActions.deleteDoc(window.fbActions.doc(window.db, "movies", firebaseId));
        } catch (e) {
            console.error(e);
        }
    }
};

/**
 * MODAL & RATING
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
    if (!currentMovieToFinish || !currentUser) return;

    const userRating = parseFloat(userRatingInput.value);
    const userComment = userCommentInput.value;

    try {
        const movieRef = window.fbActions.doc(window.db, "movies", currentMovieToFinish);
        const { updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");

        await updateDoc(movieRef, {
            status: 'finished',
            userRating: userRating,
            userComment: userComment,
            finishedAt: Date.now(),
            finishedBy: currentUser.email
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
 * FILTERING & SORTING
 */
function applyFilters() {
    let filtered = allMovies.filter(m => {
        const matchesSearch = m.title.toLowerCase().includes(localSearchQuery.toLowerCase());
        const matchesGenre = currentGenreFilter === "all" || (m.genre_ids && m.genre_ids.includes(parseInt(currentGenreFilter)));
        const matchesStatus = currentStatusFilter === "all" || m.status === currentStatusFilter;
        return matchesSearch && matchesGenre && matchesStatus;
    });

    filtered.sort((a, b) => {
        const [field, order] = currentSort.split('-');
        let valA = a[field] || 0;
        let valB = b[field] || 0;

        if (field === 'title') {
            return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return order === 'desc' ? valB - valA : valA - valB;
    });

    renderUIList(filtered);
}

localSearchInput.addEventListener('input', (e) => { localSearchQuery = e.target.value; applyFilters(); });
genreFilterSelect.addEventListener('change', (e) => { currentGenreFilter = e.target.value; applyFilters(); });
statusFilterSelect.addEventListener('change', (e) => { currentStatusFilter = e.target.value; applyFilters(); });
sortFilterSelect.addEventListener('change', (e) => { currentSort = e.target.value; applyFilters(); });

/**
 * RANDOMIZER
 */
function pickRandom() {
    const toWatch = allMovies.filter(m => m.status === 'watching');
    if (toWatch.length === 0) {
        alert("Ajoute des films à voir d'abord !");
        return;
    }
    const winner = toWatch[Math.floor(Math.random() * toWatch.length)];
    const poster = winner.poster_path ? `${IMAGE_BASE_URL}${winner.poster_path}` : PLACEHOLDER;
    randomResultContainer.innerHTML = `
        <div class="movie-card mini">
            <div class="card-image">
                <img src="${poster}" alt="${winner.title}">
            </div>
            <div class="card-info">
                <h3>${winner.title}</h3>
                <p class="meta">${winner.release_date ? winner.release_date.split('-')[0] : ''}</p>
            </div>
        </div>
    `;
    randomModal.classList.add('active');
}

randomBtn.addEventListener('click', pickRandom);
reshuffleBtn.addEventListener('click', pickRandom);
closeRandomBtn.addEventListener('click', () => {
    randomModal.classList.remove('active');
    randomResultContainer.innerHTML = "";
});

/**
 * SYNC & RENDERING
 */
let unsubscribeSync = null;

function initRealtimeSync() {
    if (unsubscribeSync) unsubscribeSync();
    if (!currentCoupleId) return;

    // NOUVEAU: Requête filtrée par coupleId !
    const q = window.fbActions.query(
        window.moviesCol, 
        window.fbActions.where('coupleId', '==', currentCoupleId),
        window.fbActions.orderBy('addedAt', 'desc')
    );

    unsubscribeSync = window.fbActions.onSnapshot(q, (snapshot) => {
        allMovies = snapshot.docs.map(doc => ({
            fbId: doc.id,
            ...doc.data()
        }));
        applyFilters();
    }, (error) => {
        console.error("Sync error:", error);
    });
}

function updateStats() {
    const statsRow = document.getElementById('stats-dashboard');
    if (!allMovies || allMovies.length === 0) {
        statsRow.style.display = 'none';
        return;
    }
    statsRow.style.display = 'grid';

    document.getElementById('stat-total').textContent = allMovies.length;
    const finishedCount = allMovies.filter(m => m.status === 'finished').length;
    document.getElementById('stat-time').textContent = `${Math.floor((finishedCount * 120) / 60)}h`;

    const genreCounts = {};
    const userCounts = {};
    allMovies.forEach(m => {
        (m.genres || []).forEach(g => genreCounts[g] = (genreCounts[g] || 0) + 1);
        if (m.addedBy) {
            const name = m.addedBy.split('@')[0];
            userCounts[name] = (userCounts[name] || 0) + 1;
        }
    });
    const topGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0];
    const topUser = Object.entries(userCounts).sort((a, b) => b[1] - a[1])[0];
    
    document.getElementById('stat-genre').textContent = topGenre ? topGenre[0] : '-';
    document.getElementById('stat-user').textContent = topUser ? topUser[0] : '-';
}

function renderUIList(movies) {
    updateStats();
    const myListGrid = document.querySelector('.movie-grid');
    const countSpan = document.querySelector('.count');
    countSpan.textContent = `${movies.length} film${movies.length > 1 ? 's' : ''}`;

    if (!currentUser) {
        myListGrid.innerHTML = '<p class="empty-msg">Connectez-vous pour voir notre liste.</p>';
        return;
    }

    if (movies.length === 0) {
        myListGrid.innerHTML = '<p class="empty-msg">Aucun film dans cette liste.</p>';
        return;
    }

    myListGrid.innerHTML = movies.map(movie => {
        const poster = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : PLACEHOLDER;
        const isFinished = movie.status === 'finished';
        const addedBySnippet = movie.addedBy ? `<span class="added-by">Ajouté par ${movie.addedBy.split('@')[0]}</span>` : '';
        const genresSnippet = movie.genres ? `
            <div class="genre-tags">
                ${movie.genres.slice(0, 2).map(g => `<span class="genre-tag">${g}</span>`).join('')}
            </div>
        ` : '';

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
                    ${addedBySnippet}
                    ${genresSnippet}
                    
                    <div class="card-actions">
                        <button class="trailer-btn" onclick="openTrailer('${movie.tmdbId || movie.id || ''}')">
                            <i data-lucide="play"></i> Trailer
                        </button>

                        ${!isFinished ? `
                            <button class="finish-btn" onclick="openRatingModal('${movie.fbId}')">
                                <i data-lucide="check"></i> Terminé
                            </button>
                        ` : `
                            <div class="user-review">
                                <div class="user-score">${movie.finishedBy ? movie.finishedBy.split('@')[0] : 'Note'} : ${movie.userRating || '?'}/10</div>
                                ${movie.userComment ? `<div class="user-comment">"${movie.userComment}"</div>` : ''}
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

/**
 * STARTUP
 */
const checkFB = setInterval(() => {
    if (window.auth) {
        clearInterval(checkFB);
        initAuth();
    }
}, 100);