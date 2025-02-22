#!/usr/bin/env  bash
set -o errexit
set -o pipefail
set -o nounset

: "${DB_NAME:?Need to set DB_NAME non-empty}"
: "${DB_USER:?Need to set DB_USER non-empty}"
: "${DB_HOST:?Need to set DB_HOST non-empty}"
: "${DB_PASS:?Need to set DB_PASS non-empty}"
: "${DB_ROOT_PASS:?Need to set DB_ROOT_PASS non-empty}"

MYSQL="mysql --default-character-set=utf8mb4"
DL_FOLDER="."


usage()
{
  echo "Refreshes content. At the minimum, the Grapher database is cleared and populated after downloading the latest archives."
  echo "The Grapher database is only populated with owid_metadata by default. Add --with-chartdata to have access to the full content."
  echo "Usage: refresh [options...]"
  echo ""
  echo "Options:"
  echo -e "\t-h, --help"
  echo "Set SKIP_DB_DL to true to skip downloading and try to use local files"
  echo "Set WITH_CHARTDATA to true to include downloading data for used charts"
#   echo -e "\t-s, --skip-db-dl\tImports all databases from existing dumps. Run once without option to retrieve them."
#   echo -e "\t-c, --with-chartdata\tDownloads additional Grapher chart data (owid_chartdata)"
}


purge_db(){
  $MYSQL -h $1 -uroot -p$DB_ROOT_PASS --port 3306 -e "DROP DATABASE IF EXISTS $2;CREATE DATABASE $2; GRANT ALL PRIVILEGES ON $2.* TO '$3'"
}

import_db(){
  pv $1 | gunzip | $MYSQL -h $2 --port 3306 -u$4 -p$5 $3
}

fillGrapherDb() {
    # Grapher database (owid_metadata)
    if [ "${SKIP_DB_DL:-false}" = false ]; then
    echo "Downloading live Grapher metadata database (owid_metadata)"
    curl -Lo $DL_FOLDER/owid_metadata.sql.gz https://files.ourworldindata.org/owid_metadata.sql.gz
    fi
    echo "Importing live Grapher metadata database (owid_metadata)"
    purge_db $DB_HOST $DB_NAME $DB_USER
    import_db $DL_FOLDER/owid_metadata.sql.gz $DB_HOST $DB_NAME $DB_USER $DB_PASS

    # Grapher database (owid_chartdata)
    if [ "${WITH_CHARTDATA:-false}" = true ]; then
    if [ "${SKIP_DB_DL:-false}" = false ]; then
        echo "Downloading live Grapher chartdata database (owid_chartdata)"
        curl -Lo $DL_FOLDER/owid_chartdata.sql.gz https://files.ourworldindata.org/owid_chartdata.sql.gz
    fi
    echo "Importing live Grapher chartdata database (owid_chartdata)"
    import_db $DL_FOLDER/owid_chartdata.sql.gz $DB_HOST $DB_NAME $DB_USER $DB_PASS
    fi
}
fillGrapherDb
