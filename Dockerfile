FROM ubuntu AS base

WORKDIR /app

COPY ./dist/launchsniper ./

CMD ["./launchsniper"]
