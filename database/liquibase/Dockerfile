# The official Liquibase image ships without the MySQL JDBC driver, so add it once at build time.
# Pinned so every machine runs the same Liquibase and the same driver.
FROM liquibase/liquibase:4.31.1
RUN lpm add mysql --global
