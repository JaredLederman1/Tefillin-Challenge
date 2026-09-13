# Ratzon website domain

The production website is https://ratzonapp.com, served by GitHub Pages from the root of the `gh-pages` branch of JaredLederman1/Tefillin-Challenge. Preserve the CNAME file when publishing site changes.

Namecheap uses BasicDNS (dns1.registrar-servers.com and dns2.registrar-servers.com). Host records:

- Four A records for @: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153.
- CNAME www: jaredlederman1.github.io.
- TXT _github-pages-challenge-JaredLederman1: GitHub ownership verification record. Retain this record.

The default parking CNAME and root URL redirect were replaced. Mail settings were preserved. GitHub handles HTTPS certificate provisioning and redirects www to the configured apex domain.
