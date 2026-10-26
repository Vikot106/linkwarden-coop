import { GetServerSideProps } from "next";
import { serverSideTranslations } from "next-i18next/serverSideTranslations";
import { getDefaultLocale, supportedLocales } from "@/lib/shared/language";
import { getToken } from "next-auth/jwt";
import { prisma } from "@linkwarden/prisma";

export const getPageTranslations = async (
  ctx: Parameters<GetServerSideProps>[0]
) => {
  let locale =
    ctx.locale && supportedLocales.includes(ctx.locale)
      ? ctx.locale
      : getDefaultLocale();
  const token = await getToken({ req: ctx.req });

  if (token) {
    const user = await prisma.user.findUnique({
      where: {
        id: token.id,
      },
    });

    if (user && supportedLocales.includes(user.locale)) {
      locale = user.locale;
    }
  }

  return serverSideTranslations(locale, ["common"]);
};

const getServerSideProps: GetServerSideProps = async (ctx) => ({
  props: await getPageTranslations(ctx),
});

export default getServerSideProps;
