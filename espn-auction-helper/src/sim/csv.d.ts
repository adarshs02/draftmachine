/** CSV files imported by the simulator page; esbuild bundles them as text (loader '.csv': 'text'). */
declare module '*.csv' {
  const text: string
  export default text
}
