// server.js - Point d'entrée du serveur

// Importation des modules
const express = require('express');
const fsp = require('fs').promises;
const cors = require('cors');
const axios = require('axios');
const path = require("path");
const {OpenAI} = require('openai');

require('dotenv').config();

// Initialisation de l'API OpenAI
const openai = new OpenAI({apiKey: process.env.OPENAI_APIKEY});

// Constantes
const PORT = 3005;
const CLEAR_CHECK_INTERVAL = 1000 * 60 * 60;
const CLEAR_THRESHOLD = 1000 * 60 * 60 * 24 * 3;
const MAXAI_REQUESTS = 20;

// Variables
let AIRequestCount = 0;

// Création de l'application express
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Fonction - Réinitialiser le compteur de demandes à l'AI
function resetAIRequestCount() {
	const now = new Date();
	const timeUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
	setTimeout(() => {
		AIRequestCount = 0;
		console.log('Le compteur de requêtes AI a été réinitialisé.');
		resetAIRequestCount();
	}, timeUntilMidnight);
}

// Fonction - Lire les films
async function readMovies() {
	try {
		const data = await fsp.readFile('movies.json', 'utf-8');
		console.info('Les films ont été lus.');
		return JSON.parse(data);
	} catch (err) {
		console.error('Erreur lors de la lecture des films.', err);
		return false;
	}
}

// Fonction - Nettoyer les films
async function clearMovies() {
	try {
		const movies = await readMovies();
		if (!movies) {
			return;
		}

		const now = Date.now();
		const filteredMovies = movies.filter(movie => {
			return !movie.completed || (now - movie.completedAt <= CLEAR_THRESHOLD);
		});

		console.info('Les films ont été nettoyées.');
		return await fsp.writeFile('movies.json', JSON.stringify(filteredMovies, null, 2));
	} catch (err) {
		console.error('Erreur lors du nettoyage des films.', err);
	}
}

// Route GET - Récupérer les films
app.get('/movies', async (req, res) => {
	const movies = await readMovies();
	if (!movies) {
		res.status(500).send('Erreur lors de la lecture des films.');
		return;
	}
	res.json(movies);
});

// Route POST - Créer un film
app.post('/movies', async (req, res) => {
	let movie = req.body.movie;

	if (!movie) {
		res.status(400).send('Le nom ou le lien du film IMDb est requis (Format IMDb : https://[www.][m.]imdb.com/title/[identifiant]/).');
		return;
	}

	let movieLink = "";
	if (/^https?:\/\/(?:www\.|m\.)?imdb\.com\/title\/(tt\d+)(\/.*)?$/.test(movie)) {
		movieLink = movie;
		movie = movie + " (Titre IMDb inconnu)";
		try {
			const response = await axios.get(movieLink, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
				}
			});
			const data = response.data;

			const match = data.match(/<title>(.*?)<\/title>/);

			if (match && match[1]) {
				movie = match[1].replace('- IMDb', '').trim();
			}
		} catch {
		}
	} else if (/^(https?:\/\/)/.test(movie)) {
		res.status(400).send('IMDb est le seul service supporté actuellement.');
		return;
	}

	const newMovie = {
		id: Date.now(),
		content: movieLink ? `<a href="${movieLink}" target="_blank">${movie}</a>` : movie,
		completed: false
	};

	const movies = await readMovies();
	if (!movies) {
		res.status(500).send('Erreur lors de la lecture des films existants.');
		return;
	}

	movies.push(newMovie);
	try {
		await fsp.writeFile('movies.json', JSON.stringify(movies, null, 2));
		res.json(movies);
	} catch (err) {
		console.error('Erreur lors de la création du film.', err);
		res.status(500).send('Erreur lors de la création du film.');
	}
});

// Route PATCH - Marquer un film comme complété
app.patch('/movies/edit/toggle/:id', async (req, res) => {
	const id = parseInt(req.params.id);

	if (req.body.password !== "MineCraft77A") {
		return res.status(401).send('Erreur lors de la modification du film.');
	}

	const movies = await readMovies();
	if (!movies) {
		res.status(500).send('Erreur lors de la lecture des films existants.');
		return;
	}

	const movieIndex = movies.findIndex(movie => movie.id === id);
	if (movieIndex === -1) {
		res.status(404).send('Film introuvable.');
		return;
	}

	movies[movieIndex].completed = !movies[movieIndex].completed;
	movies[movieIndex].inProgress = false;
	if (movies[movieIndex].completed) {
		movies[movieIndex].completedAt = Date.now();
	}

	try {
		await fsp.writeFile('movies.json', JSON.stringify(movies, null, 2));
		res.json(movies);
	} catch (err) {
		console.error('Erreur lors de la modification du film.', err);
		res.status(500).send('Erreur lors de la modification du film.');
	}
});

// Route DELETE - Supprimer un film
app.delete('/movies/:id', async (req, res) => {
	const id = parseInt(req.params.id);

	const movies = await readMovies();
	if (!movies) {
		res.status(500).send('Erreur lors de la lecture des films existants.');
		return;
	}

	const movieIndex = movies.findIndex(movie => movie.id === id);
	if (movieIndex === -1) {
		res.status(404).send('Film introuvable.');
		return;
	}

	movies.splice(movieIndex, 1);

	try {
		await fsp.writeFile('movies.json', JSON.stringify(movies, null, 2));
		res.json(movies);
	} catch (err) {
		console.error('Erreur lors de la suppression du film.', err);
		res.status(500).send('Erreur lors de la suppression du film.');
	}
});

// Route POST - Demander à l'AI
app.post('/ai', async (req, res) => {
	const prompt = req.body.prompt;

	if (!prompt) {
		res.status(400).send('Le message est requis.');
		return;
	} else if (prompt.length > 128) {
		res.status(400).send('Le message est trop long.');
		return;
	}

	if (AIRequestCount >= MAXAI_REQUESTS) {
		res.status(429).send(`Liste2FilmsAI n'est plus disponible aujourd'hui (${AIRequestCount}/${MAXAI_REQUESTS} requêtes), veuillez réessayer à demain.`);
		return;
	}

	try {
		const thread = await openai.beta.threads.create();

		const message = await openai.beta.threads.messages.create(
			thread.id,
			{
				role: "user",
				content: prompt
			}
		);

		let run = await openai.beta.threads.runs.createAndPoll(
			thread.id,
			{
				assistant_id: "asst_5udElzUvSKfSV3o97hwWzHiB"
			}
		);

		if (run.status === 'completed') {
			const messages = await openai.beta.threads.messages.list(
				run.thread_id
			);
			const reply = messages.data[0].content[0].text.value
			AIRequestCount++;
			res.json({reply});
		} else {
			console.log(run);
			res.status(500).send('Liste2FilmsAI n\'est pas disponible pour le moment.');
			return;
		}
	} catch (err) {
		console.error('Erreur lors de la demande à l\'AI.', err);
		res.status(500).send('Liste2FilmsAI n\'est pas disponible pour le moment.');
	}
});

// Route - Page d'accueil
app.get('*', (req, res) => {
	res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
});

// Démarrage du serveur
app.listen(PORT, () => {
	console.log(`Le serveur est démarré sur le port ${PORT}.`);
});

// Intervalle - Nettoyage des films
setInterval(clearMovies, CLEAR_CHECK_INTERVAL);
// Intervalle - Réinitialiser le compteur de demandes à l'AI
resetAIRequestCount();