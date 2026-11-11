FROM node:24-alpine AS web
WORKDIR /workspace
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/crdt/package.json ./packages/crdt/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY e2e/package.json ./e2e/package.json
RUN --mount=type=cache,id=weft-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter web build

FROM eclipse-temurin:21-jdk AS server
WORKDIR /workspace/server
COPY server ./
COPY --from=web /workspace/apps/web/dist ./src/main/resources/static
RUN --mount=type=cache,id=weft-gradle,target=/root/.gradle \
    chmod +x gradlew && ./gradlew bootJar --no-daemon --info --max-workers=2

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 weft
COPY --from=server /workspace/server/build/libs/weft-server-0.1.0.jar /app/app.jar
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
