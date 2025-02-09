# Use Node.js 18 as the base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy Yarn config from the root
COPY ../../package.json ../../yarn.lock ../../.yarnrc.yml ../../.yarn/ ./

# Copy the API package source code
COPY . .

# Use yarn berry
RUN yarn set version berry

# Install only the dependencies for the API package
RUN yarn install --immutable --check-cache && yarn patch-package  && yarn rebuild

# Expose the API port
EXPOSE 3001

# Start the API
CMD ["yarn", "api"]
