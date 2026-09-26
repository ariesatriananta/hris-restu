export function OnboardingSteps({ activeStep }: { activeStep: 1 | 2 | 3 | 4 }) {
  const steps = [
    'Import karyawan',
    'Buat kontrak',
    'Aktivasi',
    'Siapkan Attendance',
  ]
  return (
    <ol
      className='grid grid-cols-2 gap-2 sm:grid-cols-4'
      aria-label='Tahapan onboarding'
    >
      {steps.map((label, index) => {
        const step = (index + 1) as 1 | 2 | 3 | 4
        const complete = step < activeStep
        const active = step === activeStep
        return (
          <li
            key={label}
            className={`rounded-lg border px-3 py-2 text-center text-xs sm:text-sm ${
              active
                ? 'border-primary bg-primary/5 font-medium text-primary'
                : complete
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300'
                  : 'text-muted-foreground'
            }`}
          >
            <span className='block text-[10px] uppercase'>Langkah {step}</span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}
