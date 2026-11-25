<template>
  <div class="grid min-h-dvh lg:grid-cols-[minmax(20rem,0.9fr)_minmax(32rem,1fr)]">
    <header class="flex items-center gap-3 border-b bg-card px-6 py-5 lg:relative lg:flex-col lg:items-start lg:border-r lg:border-b-0 lg:bg-foreground lg:p-12 lg:text-background">
      <div class="flex items-center gap-3">
        <span aria-hidden="true" class="grid size-9 place-items-center rounded-lg bg-foreground text-sm font-semibold text-background lg:bg-background lg:text-foreground">R</span>
        <span class="text-base font-semibold tracking-tight">RepHarbor</span>
      </div>
      <p class="hidden max-w-[12ch] text-5xl leading-[1.06] font-medium tracking-tight lg:my-auto lg:block xl:text-6xl">
        Shared commission statements
      </p>
    </header>
    <main class="mx-auto grid w-full max-w-md content-center px-6 py-12 sm:px-8 lg:py-20">
      <slot />
    </main>
  </div>
</template>
