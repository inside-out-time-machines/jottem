vcl 4.1;
import std;

# Varnish voor Cantaloupe (IIIF Image API): tiles en info.json agressief cachen.
# Gepubliceerde beelden zijn immutable, dus lange TTL's zijn veilig (zie systeemarchitectuur);
# bij depublicatie purgen de workers de betreffende URL's.

backend cantaloupe {
    .host = "cantaloupe";
    .port = "8182";
}

acl purgers {
    "10.0.0.0"/8;
    "172.16.0.0"/12;
    "192.168.0.0"/16;
}

sub vcl_recv {
    set req.backend_hint = cantaloupe;
    # PURGE en BAN zijn beheeracties. De acl hierboven is daarvoor niet genoeg:
    # publiek verkeer komt via Traefik binnen en draagt dus ook een intern adres, zodat
    # iedereen op internet de cache leeg kon halen. De aanroeper moet daarom het
    # gedeelde geheim meesturen; ontbreekt dat aan één van beide kanten, dan gaat de
    # deur dicht.
    if (req.method == "PURGE" || req.method == "BAN") {
        if (std.getenv("VARNISH_BEHEERSLEUTEL") == ""
            || req.http.X-Jottem-Sleutel != std.getenv("VARNISH_BEHEERSLEUTEL")
            || !client.ip ~ purgers) {
            return (synth(403, "Niet toegestaan"));
        }
    }
    if (req.method == "PURGE") {
        return (purge);
    }
    # Depublicatie haalt alle URL's van één beeld in één keer weg. PURGE werkt per
    # exacte URL en zou elke tegel apart moeten noemen; een ban op de identifier raakt
    # info.json en alle tegels tegelijk. De identifier komt uit een header en gaat
    # daarom eerst door een strikte controle, want een ban-expressie is code.
    if (req.method == "BAN") {
        if (req.http.X-Jottem-Beeld !~ "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$") {
            return (synth(400, "Geen geldige beeld-id"));
        }
        ban("req.url ~ ^/iiif/3/" + req.http.X-Jottem-Beeld);
        return (synth(200, "Geband"));
    }
    # cache onafhankelijk van cookies
    unset req.http.Cookie;
}

sub vcl_backend_response {
    if (beresp.status == 200) {
        set beresp.ttl = 7d;
        set beresp.http.Cache-Control = "public, max-age=604800";
    }
}

sub vcl_deliver {
    # de viewer draait op dev.iotm.nl en haalt tiles cross-origin op
    set resp.http.Access-Control-Allow-Origin = "*";
}
