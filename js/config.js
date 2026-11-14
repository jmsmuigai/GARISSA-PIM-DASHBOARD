/* Dashboard settings. Edit this file when the dashboard moves to the official County host. */
const CONFIG = {
  FEEDBACK_EMAIL: 'feedback@garissa.go.ke',
  RESPONSE_DAYS: 7,

  /* How feedback is delivered:
     'formsubmit' - no server needed (GitHub Pages). Messages are relayed by formsubmit.co to FEEDBACK_EMAIL and
                    the citizen receives an automatic acknowledgement. The first message triggers a one-time
                    activation email to FEEDBACK_EMAIL which must be confirmed.
     'php'        - the County's own server: api/feedback.php stores each message in the database, emails
                    FEEDBACK_EMAIL and sends the acknowledgement. Use this on the official host.
     'mailto'     - opens the citizen's email app with the message filled in. */
  FEEDBACK_MODE: 'formsubmit',
  PHP_ENDPOINT: 'api/feedback.php',

  /* Base maps. All are free, open services that need no licence key. */
  BASEMAPS: {
    layer_osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors', max: 19 },
    layer_hyb: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagery © Esri, Maxar, Earthstar Geographics', max: 18,
                 labels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
                 roads: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}' },
    layer_sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagery © Esri, Maxar, Earthstar Geographics', max: 18 },
    layer_light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap contributors © CARTO', max: 19 },
    layer_topo: { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', max: 17 },
    layer_dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© OpenStreetMap contributors © CARTO', max: 19 }
  },
  DEFAULT_BASEMAP: 'layer_osm'
};
