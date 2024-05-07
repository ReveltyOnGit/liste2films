module.exports = {
	apps: [{
		name: "WEBSITE | liste2films.bryantank.fr",
		script: "./server.js",
		watch: true,
		ignore_watch: ["logs", "public", "node_modules", "movies.json"]
	}]
}
