# Jottem

Monorepo van het **Jottem-platform**: het participatieve digitale erfgoedplatform van
[Inside Out Time Machines](https://www.iotm.nl/) waarmee inwoners foto's, documenten en
herinneringen delen binnen projecten van erfgoedorganisaties - te beginnen met de pilot
*Smaak van Gouda* (Streekarchief Midden-Holland).

## Structuur (voorzien)

```
api/        backend-API (FastAPI) + Celery-workers
frontend/   webfrontend (Next.js)
deploy/     docker-compose en configuratie (zonder secrets)
tests/      contract- en end-to-end-tests
```

## Ontwerp

- Ontwerpdocument: https://design.iotm.nl/ ([repo](https://github.com/inside-out-time-machines/design))
- Realisatieplan (MVP-scope en mijlpalen): https://design.iotm.nl/#realisatieplan
- Klikbaar prototype: https://prototype.iotm.nl/

De [Herkenbaar API](https://github.com/inside-out-time-machines/herkenbaar-api) (detectie van
herkenbare personen, AGPL-3.0) is bewust een aparte repository.

## Licentie

[EUPL-1.2](LICENSE). Secrets horen nooit in deze repository; de deploy-configuratie zelf is
publiek.
