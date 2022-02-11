export default {
    // config options
    build: {
        minify: false,
        target: 'esnext',
        outDir: 'docs',
        assetsDir: '.',
    },
    base: '/sms-emu/',
    esbuild: {
        target: 'esnext'
    }
}