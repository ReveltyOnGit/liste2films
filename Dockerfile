# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7
FROM node:lts-alpine

# Use production node environment by default.
ENV NODE_ENV production

WORKDIR /usr/src/app
COPY src/ .
# Download dependencies as a separate step to take advantage of Docker's caching.
RUN npm i
USER root

# Expose the port that the application listens on.
EXPOSE 3005

# Run the application.
CMD npm run start
